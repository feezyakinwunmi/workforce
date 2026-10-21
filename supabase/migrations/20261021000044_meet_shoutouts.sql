-- Shout-outs in Meet: the host or a co-host celebrates someone; everyone in the call sees confetti
-- with the person's name (and their live camera, drawn on each viewer's own device) and hears
-- claps. Only the name, a style and an optional short line are stored; they go with the meeting
-- (deleted with it after 7 days, like the participant list).

create table public.meet_shoutouts (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.meet_rooms (id) on delete cascade,
  sender_id  uuid references public.meet_participants (id) on delete set null,
  target_id  uuid references public.meet_participants (id) on delete set null,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  style      text not null default 'shoutout' check (style in ('shoutout', 'birthday', 'welldone', 'welcome')),
  message    text check (char_length(message) <= 120),
  created_at timestamptz not null default now()
);
create index meet_shoutouts_room_idx on public.meet_shoutouts (room_id, id);
create index meet_shoutouts_sender_idx on public.meet_shoutouts (sender_id);
create index meet_shoutouts_target_idx on public.meet_shoutouts (target_id);

alter table public.meet_shoutouts enable row level security;
revoke all on public.meet_shoutouts from anon, authenticated;
grant select on public.meet_shoutouts to authenticated;
create policy "people in the meeting see its shout-outs" on public.meet_shoutouts for select to authenticated
  using (private.meet_can_see(room_id));

-- Host / co-host only. p_target = someone in the call (their name is used), or null with a typed name.
create or replace function public.meet_shoutout(p_room uuid, p_name text, p_target uuid default null, p_style text default 'shoutout', p_message text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me public.meet_participants;
  v_name text := btrim(coalesce(p_name, ''));
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_id bigint;
begin
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid() and status = 'admitted';
  if not found or me.role not in ('host', 'cohost') then
    raise exception 'Only the host and co-hosts can give shout-outs' using errcode = '42501';
  end if;
  if exists (select 1 from public.meet_rooms where id = p_room and ended_at is not null) then
    raise exception 'This meeting has ended' using errcode = '22023';
  end if;
  if p_target is not null then
    select display_name into v_name from public.meet_participants where id = p_target and room_id = p_room and status = 'admitted';
    if not found then raise exception 'That person isn''t in the meeting' using errcode = '22023'; end if;
  end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'Type a name (up to 60 characters)' using errcode = '22023'; end if;
  if coalesce(p_style, 'shoutout') not in ('shoutout', 'birthday', 'welldone', 'welcome') then raise exception 'Unknown style' using errcode = '22023'; end if;
  if char_length(v_msg) > 120 then raise exception 'Keep the message under 120 characters' using errcode = '22023'; end if;
  perform private.rate_limit('meet_shoutout:' || auth.uid()::text, 6, interval '1 minute');
  insert into public.meet_shoutouts (room_id, sender_id, target_id, name, style, message)
  values (p_room, me.id, p_target, v_name, coalesce(p_style, 'shoutout'), v_msg) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.meet_shoutout(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.meet_shoutout(uuid, text, uuid, text, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.meet_shoutouts;
  end if;
end $$;
