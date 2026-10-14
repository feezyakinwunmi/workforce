-- Chat and groups.
--
-- Channel kinds:
--   public         every member of the company can read and post (e.g. #general)
--   announcements  one per company; everyone reads, only managers/admins/owner post
--   private        a group: only its members read and post (created by managers/admins)
--   direct         a conversation between exactly two people
-- Admins cannot read direct messages or private groups they are not in.
-- channel_members rows also hold last_read_at (for unread counts); for public channels
-- and announcements the row is created the first time someone opens the channel.

create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  kind            text not null check (kind in ('public', 'private', 'direct', 'announcements')),
  name            text check (kind = 'direct' or char_length(trim(name)) between 1 and 60),
  description     text check (char_length(description) <= 300),
  dm_key          text check ((kind = 'direct') = (dm_key is not null)), -- "<smaller uuid>:<bigger uuid>"
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  archived_at     timestamptz,
  last_message_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, dm_key)
);
create unique index channels_name_unique on public.channels (organization_id, lower(name)) where kind <> 'direct';
create unique index channels_one_announcements on public.channels (organization_id) where kind = 'announcements';
create index channels_created_by_idx on public.channels (created_by);

create table public.channel_members (
  channel_id      uuid not null,
  organization_id uuid not null,
  user_id         uuid not null,
  role            text not null default 'member' check (role in ('member', 'admin')),
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (channel_id, user_id),
  foreign key (organization_id, channel_id) references public.channels (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index channel_members_user_idx on public.channel_members (user_id);
create index channel_members_org_user_idx on public.channel_members (organization_id, user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  channel_id      uuid not null,
  author_id       uuid references auth.users (id) on delete set null default auth.uid(),
  body            text not null check (deleted_at is not null or char_length(trim(body)) between 1 and 4000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  foreign key (organization_id, channel_id) references public.channels (organization_id, id) on delete cascade
);
create index messages_channel_time_idx on public.messages (channel_id, created_at desc);
create index messages_author_idx on public.messages (author_id);
create index messages_org_idx on public.messages (organization_id);

-- ---------------------------------------------------------------------
-- Helpers (security definer, so policies don't recurse)
-- ---------------------------------------------------------------------
create or replace function private.my_channel_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(cm.channel_id), '{}')
  from public.channel_members cm
  where cm.user_id = auth.uid() and cm.organization_id = private.current_org_id();
$$;

create or replace function private.can_read_channel(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel and c.organization_id = private.current_org_id()
      and (c.kind in ('public', 'announcements')
           or exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())));
$$;

create or replace function private.can_post_channel(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel and c.organization_id = private.current_org_id() and c.archived_at is null
      and (c.kind = 'public'
           or (c.kind = 'announcements' and private.is_manager_or_admin())
           or (c.kind in ('private', 'direct')
               and exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()))));
$$;

-- Every company has #general and Announcements.
create or replace function private.ensure_default_channels(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.channels (organization_id, kind, name, description, created_by)
  select p_org, 'public', 'general', 'Everyone in the company', null
  where not exists (select 1 from public.channels where organization_id = p_org and kind <> 'direct' and lower(name) = 'general');
  insert into public.channels (organization_id, kind, name, description, created_by)
  select p_org, 'announcements', 'Announcements', 'News from the company. Only managers and admins post here.', null
  where not exists (select 1 from public.channels where organization_id = p_org and kind = 'announcements');
$$;

create or replace function private.on_organization_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_default_channels(new.id);
  return null;
end $$;

create trigger organizations_default_channels after insert on public.organizations
  for each row execute function private.on_organization_created();

select private.ensure_default_channels(id) from public.organizations;

-- ---------------------------------------------------------------------
-- Message rules
-- ---------------------------------------------------------------------
create or replace function private.guard_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select c.organization_id into new.organization_id from public.channels c where c.id = new.channel_id;
    new.author_id := auth.uid();
    new.body := trim(new.body);
    new.created_at := now();
    new.edited_at := null;
    new.deleted_at := null;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'This message was deleted' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';        -- deleted text is gone, not hidden
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

create trigger messages_guard before insert or update on public.messages
  for each row execute function private.guard_message();

-- After a new message: bump the channel, notify for direct messages and announcements.
alter type public.notification_kind add value if not exists 'chat_direct';
alter type public.notification_kind add value if not exists 'announcement';

create or replace function private.after_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c    public.channels;
  who  text := coalesce(private.person_name(new.author_id), 'Someone');
  v_link text := '/dashboard/chat/' || new.channel_id;
  r    record;
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id returning * into c;

  if c.kind = 'direct' then
    for r in select cm.user_id from public.channel_members cm
             where cm.channel_id = c.id and cm.user_id is distinct from new.author_id loop
      -- One unread notification per conversation, not one per message.
      if not exists (select 1 from public.notifications n
                     where n.user_id = r.user_id and n.link = v_link and n.read_at is null) then
        perform private.notify(new.organization_id, r.user_id, 'chat_direct',
          'New message from ' || who, new.body, v_link, null, new.author_id);
      end if;
    end loop;
  elsif c.kind = 'announcements' then
    for r in select m.user_id from public.memberships m
             where m.organization_id = new.organization_id and m.status = 'active' loop
      perform private.notify(new.organization_id, r.user_id, 'announcement',
        who || ' posted an announcement', new.body, v_link, null, new.author_id);
    end loop;
  end if;
  return null;
end $$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.after_message();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
-- Managers/admins create a group. Private groups get the listed members; public ones are open to all.
create or replace function public.create_channel(
  p_name text, p_description text default null, p_private boolean default true, p_member_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_id  uuid;
begin
  if v_org is null or not private.is_manager_or_admin() then
    raise exception 'Only managers and admins can create groups' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Give the group a name (up to 60 characters)' using errcode = '22023';
  end if;

  insert into public.channels (organization_id, kind, name, description)
  values (v_org, case when p_private then 'private' else 'public' end,
          trim(p_name), nullif(trim(coalesce(p_description, '')), ''))
  returning id into v_id;

  insert into public.channel_members (channel_id, organization_id, user_id, role)
  values (v_id, v_org, auth.uid(), 'admin');

  if p_private then
    insert into public.channel_members (channel_id, organization_id, user_id)
    select v_id, v_org, m.user_id from public.memberships m
    where m.organization_id = v_org and m.status = 'active'
      and m.user_id = any (coalesce(p_member_ids, '{}')) and m.user_id <> auth.uid();
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'A group with that name already exists' using errcode = '23505';
end $$;

-- Open (or create) the direct conversation with another member.
create or replace function public.open_direct(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_key text;
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'Your account is not active in any company' using errcode = '42501';
  end if;
  if p_user is null or p_user = auth.uid() then
    raise exception 'Pick someone else to message' using errcode = '22023';
  end if;
  if not exists (select 1 from public.memberships m
                 where m.organization_id = v_org and m.user_id = p_user and m.status = 'active') then
    raise exception 'That person is not an active member of your company' using errcode = '22023';
  end if;

  v_key := least(auth.uid()::text, p_user::text) || ':' || greatest(auth.uid()::text, p_user::text);
  select id into v_id from public.channels where organization_id = v_org and dm_key = v_key;
  if v_id is null then
    insert into public.channels (organization_id, kind, dm_key) values (v_org, 'direct', v_key)
    on conflict (organization_id, dm_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.channels where organization_id = v_org and dm_key = v_key;
    end if;
    insert into public.channel_members (channel_id, organization_id, user_id)
    values (v_id, v_org, auth.uid()), (v_id, v_org, p_user)
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- Add people to a private group (group admin, or company manager/admin who is in it).
create or replace function public.add_channel_members(p_channel uuid, p_user_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  c     public.channels;
  n     integer;
begin
  select * into c from public.channels where id = p_channel and organization_id = v_org;
  if not found or c.kind <> 'private' then
    raise exception 'People can only be added to private groups' using errcode = '22023';
  end if;
  if not exists (select 1 from public.channel_members cm
                 where cm.channel_id = c.id and cm.user_id = auth.uid()
                   and (cm.role = 'admin' or private.is_manager_or_admin())) then
    raise exception 'Only the group''s admins can add people' using errcode = '42501';
  end if;
  insert into public.channel_members (channel_id, organization_id, user_id)
  select c.id, v_org, m.user_id from public.memberships m
  where m.organization_id = v_org and m.status = 'active' and m.user_id = any (coalesce(p_user_ids, '{}'))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Leave a private group, or (group admin) remove someone from it.
create or replace function public.remove_channel_member(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.channels;
begin
  select * into c from public.channels where id = p_channel and organization_id = private.current_org_id();
  if not found or c.kind <> 'private' then
    raise exception 'You can only leave private groups' using errcode = '22023';
  end if;
  if p_user is distinct from auth.uid() and not exists (
       select 1 from public.channel_members cm
       where cm.channel_id = c.id and cm.user_id = auth.uid() and (cm.role = 'admin' or private.is_org_admin())) then
    raise exception 'Only the group''s admins can remove people' using errcode = '42501';
  end if;
  delete from public.channel_members where channel_id = c.id and user_id = p_user;
end $$;

-- Opened a channel: everything up to now is read (and its message notifications too).
create or replace function public.mark_channel_read(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
begin
  if not private.can_read_channel(p_channel) then
    return;
  end if;
  insert into public.channel_members (channel_id, organization_id, user_id, last_read_at)
  select p_channel, v_org, auth.uid(), now()
  from public.channels c where c.id = p_channel and c.kind in ('public', 'announcements')
  on conflict (channel_id, user_id) do update set last_read_at = now();
  update public.channel_members set last_read_at = now()
  where channel_id = p_channel and user_id = auth.uid();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and link = '/dashboard/chat/' || p_channel;
end $$;

-- The sidebar: channels I can see, with unread counts.
create or replace function public.my_channels()
returns table (id uuid, kind text, name text, description text, other_user_id uuid,
               last_message_at timestamptz, unread integer, archived boolean, is_member boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select m.organization_id as org, m.joined_at from public.memberships m
    where m.user_id = auth.uid() and m.status = 'active' limit 1
  )
  select c.id, c.kind, c.name, c.description,
         case when c.kind = 'direct' then (
           select cm2.user_id from public.channel_members cm2 where cm2.channel_id = c.id and cm2.user_id <> auth.uid() limit 1)
         end,
         c.last_message_at,
         (select count(*)::int from public.messages msg
          where msg.channel_id = c.id and msg.deleted_at is null and msg.author_id is distinct from auth.uid()
            and msg.created_at > coalesce(cm.last_read_at, greatest(me.joined_at, c.created_at))),
         c.archived_at is not null,
         cm.user_id is not null
  from public.channels c
  cross join me
  left join public.channel_members cm on cm.channel_id = c.id and cm.user_id = auth.uid()
  where c.organization_id = me.org
    and (c.kind in ('public', 'announcements') or cm.user_id is not null)
  order by (c.kind = 'announcements') desc, c.kind = 'direct', c.last_message_at desc nulls last, c.name;
$$;

-- Who is working right now (clocked in, app reporting): the green dot in chat.
create or replace function public.online_member_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct s.user_id), '{}')
  from public.work_sessions s
  where s.organization_id = private.current_org_id() and s.ended_at is null
    and coalesce(s.last_heartbeat_at, s.started_at) > now() - interval '3 minutes';
$$;

-- ---------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;

create policy "read visible channels" on public.channels
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (kind in ('public', 'announcements') or id = any ((select private.my_channel_ids())::uuid[])));
create policy "managers rename or archive groups" on public.channels
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and kind in ('public', 'private')
         and (select private.is_manager_or_admin()))
  with check (organization_id = (select private.current_org_id()));

create policy "read members of visible channels" on public.channel_members
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_read_channel(channel_id));
create policy "update own read marker" on public.channel_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read messages of visible channels" on public.messages
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_read_channel(channel_id));
create policy "post where allowed" on public.messages
  for insert to authenticated
  with check (private.can_post_channel(channel_id));
create policy "edit or delete own messages, admins delete" on public.messages
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_read_channel(channel_id)
         and (author_id = (select auth.uid()) or (select private.is_org_admin())))
  with check (organization_id = (select private.current_org_id()));

revoke all on public.channels, public.channel_members, public.messages from anon, authenticated;
grant select on public.channels, public.channel_members, public.messages to authenticated;
grant update (name, description, archived_at) on public.channels to authenticated;
grant update (last_read_at) on public.channel_members to authenticated;
grant insert (channel_id, body), update (body, deleted_at) on public.messages to authenticated;

revoke execute on function private.my_channel_ids(), private.can_read_channel(uuid), private.can_post_channel(uuid)
  from public, anon;
grant execute on function private.my_channel_ids(), private.can_read_channel(uuid), private.can_post_channel(uuid)
  to authenticated;
revoke execute on function private.ensure_default_channels(uuid) from public, anon, authenticated;

revoke execute on function public.create_channel(text, text, boolean, uuid[]),
                           public.open_direct(uuid),
                           public.add_channel_members(uuid, uuid[]),
                           public.remove_channel_member(uuid, uuid),
                           public.mark_channel_read(uuid),
                           public.my_channels(),
                           public.online_member_ids()
  from public, anon;
grant execute on function public.create_channel(text, text, boolean, uuid[]),
                          public.open_direct(uuid),
                          public.add_channel_members(uuid, uuid[]),
                          public.remove_channel_member(uuid, uuid),
                          public.mark_channel_read(uuid),
                          public.my_channels(),
                          public.online_member_ids()
  to authenticated;

-- Live updates: the dashboard listens for new and edited messages (Realtime applies the RLS above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
