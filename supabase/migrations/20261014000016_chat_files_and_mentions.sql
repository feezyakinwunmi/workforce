-- Chat extras: files and images in messages, and @mentions.
--
-- Files live in the private Storage bucket "chat-files" at
--   <company id>/<channel id>/<random id>/<file name>
-- Storage policies reuse the chat rules: you can download files of chats you can read and
-- upload to chats you can post in. Admins still can't open files in direct messages or
-- private groups they are not in. A message may only attach files its author uploaded to
-- that chat; name, size and type are taken from Storage, not from the browser.
--
-- Mentions: the browser sends the mentioned people's ids; the database keeps only active
-- members who can read the chat, and notifies them (kind 'mention'). Not in direct
-- messages (already notified) or announcements (everyone is notified anyway).

alter table public.messages
  add column attachments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  add column mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20);

-- A message needs text or at least one file.
alter table public.messages drop constraint if exists messages_check;
alter table public.messages add constraint messages_content_check check (
  deleted_at is not null
  or (char_length(trim(body)) <= 4000 and (char_length(trim(body)) >= 1 or jsonb_array_length(attachments) > 0)));

-- ---------------------------------------------------------------------
-- Storage bucket (private; 10 MB per file; images, PDF, Office, text, zip; no SVG/HTML)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 10485760, array[
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The chat a file path belongs to, or null if the path is malformed or in another company.
create or replace function private.chat_file_channel(p_name text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  u constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or p_name !~ ('^' || u || '/' || u || '/' || u || '/[^/]{1,200}$') then
    return null;
  end if;
  if split_part(p_name, '/', 1)::uuid is distinct from private.current_org_id() then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end $$;

revoke execute on function private.chat_file_channel(text) from public, anon;
grant execute on function private.chat_file_channel(text) to authenticated;

create policy "chat files: read in chats you can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-files' and private.can_read_channel(private.chat_file_channel(name)));
create policy "chat files: upload to chats you can post in" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-files' and private.can_post_channel(private.chat_file_channel(name)));

-- ---------------------------------------------------------------------
-- Message rules (replaces the 0009 version)
-- ---------------------------------------------------------------------
create or replace function private.guard_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c     public.channels;
  files jsonb := '[]'::jsonb;
  f     jsonb;
  v_name text;
  v_meta jsonb;
begin
  if tg_op = 'INSERT' then
    select * into c from public.channels where id = new.channel_id;
    new.organization_id := c.organization_id;
    new.author_id := auth.uid();
    new.body := trim(new.body);
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;

    for f in select value from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) loop
      select o.name, o.metadata into v_name, v_meta
      from storage.objects o
      where o.bucket_id = 'chat-files' and o.name = f->>'path'
        and o.owner_id = auth.uid()::text
        and private.chat_file_channel(o.name) = new.channel_id;
      if v_name is null then
        raise exception 'A file was not found. Upload it again.' using errcode = '22023';
      end if;
      files := files || jsonb_build_array(jsonb_build_object(
        'path', v_name,
        'name', left(coalesce(nullif(trim(f->>'name'), ''), split_part(v_name, '/', 4)), 200),
        'size', coalesce((v_meta->>'size')::bigint, 0),
        'type', coalesce(v_meta->>'mimetype', 'application/octet-stream')));
      v_name := null;
    end loop;
    new.attachments := files;

    new.mentions := coalesce((
      select array_agg(distinct u)
      from unnest(coalesce(new.mentions, '{}')) as u
      where u is distinct from new.author_id
        and exists (select 1 from public.memberships m
                    where m.organization_id = new.organization_id and m.user_id = u and m.status = 'active')
        and (c.kind in ('public', 'announcements')
             or exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = u))
    ), '{}');
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'This message was deleted' using errcode = '42501';
  end if;
  new.attachments := old.attachments;   -- files and mentions are fixed once sent
  new.mentions := old.mentions;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';                     -- deleted text is gone, not hidden
    new.attachments := '[]'::jsonb;
    new.mentions := '{}';
    new.edited_at := old.edited_at;
    return new;
  end if;
  if new.body is distinct from old.body then
    if old.author_id is distinct from auth.uid() then
      raise exception 'You can only edit your own messages' using errcode = '42501';
    end if;
    new.body := trim(new.body);
    new.edited_at := now();
  end if;
  return new;
end $$;

create or replace function private.after_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c       public.channels;
  who     text := coalesce(private.person_name(new.author_id), 'Someone');
  v_link  text := '/dashboard/chat/' || new.channel_id;
  preview text := coalesce(nullif(new.body, ''), '📎 ' || (new.attachments->0->>'name'), '');
  r       record;
  u       uuid;
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id returning * into c;

  if c.kind = 'direct' then
    for r in select cm.user_id from public.channel_members cm
             where cm.channel_id = c.id and cm.user_id is distinct from new.author_id loop
      -- One unread notification per conversation, not one per message.
      if not exists (select 1 from public.notifications n
                     where n.user_id = r.user_id and n.link = v_link and n.read_at is null) then
        perform private.notify(new.organization_id, r.user_id, 'chat_direct',
          'New message from ' || who, preview, v_link, null, new.author_id);
      end if;
    end loop;
  elsif c.kind = 'announcements' then
    for r in select m.user_id from public.memberships m
             where m.organization_id = new.organization_id and m.status = 'active' loop
      perform private.notify(new.organization_id, r.user_id, 'announcement',
        who || ' posted an announcement', preview, v_link, null, new.author_id);
    end loop;
  else
    foreach u in array new.mentions loop
      perform private.notify(new.organization_id, u, 'mention',
        who || ' mentioned you in #' || c.name, preview, v_link, null, new.author_id);
    end loop;
  end if;
  return null;
end $$;

grant insert (attachments, mentions) on public.messages to authenticated;
