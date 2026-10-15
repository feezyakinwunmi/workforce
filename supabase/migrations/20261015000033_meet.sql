-- Workbase Meet: video meetings, a separate product on the same accounts.
--
-- Signed-in people host and join; guests join with a link and a name through Supabase
-- anonymous sign-in (their JWT has "is_anonymous": true). Media goes through Cloudflare
-- Realtime: the dashboard's API routes call public.meet_media_check() with the caller's
-- login before talking to Cloudflare, so only admitted people in a live meeting get media.
--
-- Plans: free hosts get 60 minutes and 25 people per meeting; Meet Pro / Meet Business
-- (meet_subscriptions) or a paid Workbase company (Standard/Pro) gets 24 hours and 50 people.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.meet_rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  host_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null default '' check (char_length(title) <= 120),
  starts_at        timestamptz,                 -- scheduled start; null = instant meeting
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  waiting_room     boolean not null default true,
  allow_guests     boolean not null default true,
  locked           boolean not null default false,
  max_participants integer not null default 25,
  started_at       timestamptz,
  ends_at          timestamptz,                 -- hard stop from the host's plan
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index meet_rooms_host_idx on public.meet_rooms (host_id, created_at desc);
create index meet_rooms_live_idx on public.meet_rooms (started_at) where ended_at is null;

create table public.meet_participants (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.meet_rooms (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 60),
  is_guest       boolean not null default false,
  role           text not null default 'member' check (role in ('host', 'cohost', 'member')),
  status         text not null default 'waiting' check (status in ('waiting', 'admitted', 'denied', 'removed', 'left')),
  sfu_session    text check (char_length(sfu_session) <= 100),
  tracks         jsonb not null default '[]'::jsonb check (jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) <= 4),
  audio_on       boolean not null default false,
  video_on       boolean not null default false,
  screen_on      boolean not null default false,
  hand_raised_at timestamptz,
  admitted_at    timestamptz,                 -- first let in; coming back skips the waiting room
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,
  unique (room_id, user_id)
);
create index meet_participants_user_idx on public.meet_participants (user_id);

-- Heartbeats live apart from meet_participants so they don't flood Realtime.
create table public.meet_presence (
  participant_id uuid primary key references public.meet_participants (id) on delete cascade,
  room_id        uuid not null references public.meet_rooms (id) on delete cascade,
  last_seen_at   timestamptz not null default now()
);
create index meet_presence_room_idx on public.meet_presence (room_id, last_seen_at);

create table public.meet_events (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.meet_rooms (id) on delete cascade,
  sender_id  uuid references public.meet_participants (id) on delete set null,
  kind       text not null check (kind in ('chat', 'reaction', 'mute', 'remove', 'end', 'lower_hand', 'stop_screen')),
  target_id  uuid references public.meet_participants (id) on delete cascade,
  body       text check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index meet_events_room_idx on public.meet_events (room_id, id);
create index meet_events_sender_idx on public.meet_events (sender_id);
create index meet_events_target_idx on public.meet_events (target_id);

create table public.meet_invites (
  room_id    uuid not null references public.meet_rooms (id) on delete cascade,
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (room_id, email)
);

-- Paid Meet plans. Pro = one host; Business = a whole company (first 20 hosts).
create table public.meet_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,   -- who paid
  organization_id uuid references public.organizations (id) on delete cascade,  -- Business only
  plan            text not null check (plan in ('pro', 'business')),
  months          integer not null check (months between 1 and 12),
  amount_kobo     integer not null check (amount_kobo > 0),
  reference       text not null unique,
  status          text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  period_start    timestamptz,
  period_end      timestamptz,
  created_at      timestamptz not null default now(),
  check (plan = 'pro' or organization_id is not null)
);
create index meet_subscriptions_user_idx on public.meet_subscriptions (user_id);
create index meet_subscriptions_org_idx on public.meet_subscriptions (organization_id);

alter table public.meet_rooms enable row level security;
alter table public.meet_participants enable row level security;
alter table public.meet_presence enable row level security;
alter table public.meet_events enable row level security;
alter table public.meet_invites enable row level security;
alter table public.meet_subscriptions enable row level security;

revoke all on public.meet_rooms, public.meet_participants, public.meet_presence, public.meet_events,
  public.meet_invites, public.meet_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.meet_is_anonymous()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean, false)
$$;

-- Prices in kobo per month. 12 months cost 10.
create or replace function private.meet_price_kobo(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'pro' then 100000 when 'business' then 1000000 end
$$;

-- 'pro' when a paid Meet plan or a paid Workbase company covers this person, else 'free'.
create or replace function private.meet_tier(p_user uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_rank integer;
begin
  if exists (select 1 from public.meet_subscriptions s
             where s.user_id = p_user and s.plan = 'pro' and s.status = 'success'
               and s.period_start <= now() and s.period_end > now()) then
    return 'pro';
  end if;
  select m.organization_id into v_org from public.memberships m where m.user_id = p_user and m.status = 'active' limit 1;
  if v_org is null then return 'free'; end if;
  -- Workbase Standard or Pro includes Meet Pro.
  if exists (select 1 from private.org_billing(v_org) b where b.tier in ('standard', 'pro')) then
    return 'pro';
  end if;
  -- Meet Business: the first 20 active members (owner first, then by joining date) host on Pro.
  if exists (select 1 from public.meet_subscriptions s
             where s.organization_id = v_org and s.plan = 'business' and s.status = 'success'
               and s.period_start <= now() and s.period_end > now()) then
    select r.rank into v_rank from (
      select m.user_id, row_number() over (order by (m.role = 'owner') desc, m.created_at, m.user_id) as rank
      from public.memberships m where m.organization_id = v_org and m.status = 'active'
    ) r where r.user_id = p_user;
    if v_rank <= 20 then return 'pro'; end if;
  end if;
  return 'free';
end $$;

-- My row in a meeting (any status), or null.
create or replace function private.meet_me(p_room uuid)
returns public.meet_participants language sql stable security definer set search_path = '' as $$
  select p.* from public.meet_participants p where p.room_id = p_room and p.user_id = auth.uid()
$$;

-- Is the caller admitted to this meeting (or its host)?
create or replace function private.meet_can_see(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meet_rooms r where r.id = p_room and r.host_id = auth.uid())
      or exists (select 1 from public.meet_participants p
                 where p.room_id = p_room and p.user_id = auth.uid() and p.status = 'admitted')
$$;

create or replace function private.meet_is_moderator(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meet_participants p
                 where p.room_id = p_room and p.user_id = auth.uid() and p.status = 'admitted' and p.role in ('host', 'cohost'))
$$;

create or replace function private.meet_new_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  letters constant text := 'abcdefghjkmnpqrstuvwxyz';
  v text;
  i int;
begin
  loop
    v := '';
    for i in 1..10 loop
      v := v || substr(letters, 1 + floor(random() * length(letters))::int, 1);
      if i = 3 or i = 7 then v := v || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.meet_rooms where code = v);
  end loop;
  return v;
end $$;

-- People still in the meeting: admitted and seen in the last 45 seconds.
create or replace function private.meet_live_count(p_room uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.meet_participants p
  join public.meet_presence s on s.participant_id = p.id
  where p.room_id = p_room and p.status = 'admitted' and s.last_seen_at > now() - interval '45 seconds'
$$;

-- ---------------------------------------------------------------------------
-- Policies (reads only; every change goes through the functions below)
-- ---------------------------------------------------------------------------
create policy "hosts and people in the meeting see it" on public.meet_rooms for select to authenticated
  using (host_id = (select auth.uid()) or exists (
    select 1 from public.meet_participants p where p.room_id = meet_rooms.id and p.user_id = (select auth.uid())));

create policy "people in the meeting see each other" on public.meet_participants for select to authenticated
  using (user_id = (select auth.uid()) or private.meet_can_see(room_id));

create policy "people in the meeting see presence" on public.meet_presence for select to authenticated
  using (private.meet_can_see(room_id));

create policy "people in the meeting see its chat and reactions" on public.meet_events for select to authenticated
  using (private.meet_can_see(room_id));

create policy "hosts see their invites" on public.meet_invites for select to authenticated
  using (exists (select 1 from public.meet_rooms r where r.id = meet_invites.room_id and r.host_id = (select auth.uid())));

create policy "payers see their Meet plans" on public.meet_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.meet_rooms, public.meet_participants, public.meet_presence, public.meet_events,
  public.meet_invites, public.meet_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- New meeting (instant or scheduled). Guests can't host.
create or replace function public.meet_create(
  p_title text default '', p_starts_at timestamptz default null, p_duration integer default 60,
  p_waiting_room boolean default true, p_allow_guests boolean default true, p_invites text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room public.meet_rooms;
  v_email text;
begin
  if v_uid is null or private.meet_is_anonymous() then
    raise exception 'Sign in to start a meeting' using errcode = '42501';
  end if;
  if (select count(*) from public.meet_rooms where host_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many new meetings. Try again in a little while.' using errcode = '54000';
  end if;
  if p_starts_at is not null and p_starts_at < now() - interval '1 hour' then
    raise exception 'Pick a start time in the future' using errcode = '22023';
  end if;
  if coalesce(array_length(p_invites, 1), 0) > 50 then
    raise exception 'Invite up to 50 people' using errcode = '22023';
  end if;
  insert into public.meet_rooms (code, host_id, title, starts_at, duration_minutes, waiting_room, allow_guests)
  values (private.meet_new_code(), v_uid, left(trim(coalesce(p_title, '')), 120), p_starts_at,
          least(greatest(coalesce(p_duration, 60), 5), 1440), coalesce(p_waiting_room, true), coalesce(p_allow_guests, true))
  returning * into v_room;
  foreach v_email in array coalesce(p_invites, '{}') loop
    v_email := lower(trim(v_email));
    if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      insert into public.meet_invites (room_id, email) values (v_room.id, left(v_email, 200)) on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('id', v_room.id, 'code', v_room.code);
end $$;

-- What the lobby shows before joining.
create or replace function public.meet_room_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.meet_rooms;
  me public.meet_participants;
  v_tier text;
begin
  select * into r from public.meet_rooms where code = lower(trim(p_code));
  if not found then return null; end if;
  select * into me from public.meet_participants where room_id = r.id and user_id = auth.uid();
  v_tier := private.meet_tier(r.host_id);
  return jsonb_build_object(
    'id', r.id, 'code', r.code, 'title', r.title,
    'host_name', coalesce(nullif((select full_name from public.profiles where id = r.host_id), ''), 'The host'),
    'is_host', r.host_id = auth.uid(),
    'starts_at', r.starts_at, 'started', r.started_at is not null, 'ended', r.ended_at is not null,
    'ends_at', r.ends_at, 'locked', r.locked, 'allow_guests', r.allow_guests, 'waiting_room', r.waiting_room,
    'host_tier', v_tier, 'limit_minutes', case when v_tier = 'pro' then 1440 else 60 end,
    'my_status', me.status, 'my_name', me.display_name,
    'in_meeting', private.meet_live_count(r.id)
  );
end $$;

-- Join (or ask to join). Returns my participant row and the meeting's limits.
create or replace function public.meet_join(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_guest boolean := private.meet_is_anonymous();
  r public.meet_rooms;
  me public.meet_participants;
  v_name text;
  v_tier text;
  v_status text;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.meet_rooms where code = lower(trim(p_code)) for update;
  if not found then raise exception 'Meeting not found. Check the link.' using errcode = 'P0002'; end if;
  if r.ended_at is not null then raise exception 'This meeting has ended.' using errcode = '22023'; end if;
  if r.ends_at is not null and r.ends_at <= now() then raise exception 'This meeting reached its time limit.' using errcode = '22023'; end if;
  if v_guest and not r.allow_guests and r.host_id <> v_uid then
    raise exception 'Only people with a Workbase account can join this meeting.' using errcode = '42501';
  end if;

  v_name := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  if v_name = '' and not v_guest then
    v_name := left(coalesce(nullif((select full_name from public.profiles where id = v_uid), ''),
                            split_part((select email from public.profiles where id = v_uid), '@', 1)), 60);
  end if;
  if v_name = '' then raise exception 'Enter your name' using errcode = '22023'; end if;

  select * into me from public.meet_participants where room_id = r.id and user_id = v_uid for update;
  if found and me.status = 'removed' then raise exception 'The host removed you from this meeting.' using errcode = '42501'; end if;
  if found and me.status = 'denied' then raise exception 'The host didn''t let you in.' using errcode = '42501'; end if;

  if r.host_id = v_uid then
    -- The host starts the clock the first time they join.
    if r.started_at is null then
      v_tier := private.meet_tier(v_uid);
      update public.meet_rooms set started_at = now(),
        ends_at = now() + case when v_tier = 'pro' then interval '24 hours' else interval '60 minutes' end,
        max_participants = case when v_tier = 'pro' then 50 else 25 end
      where id = r.id returning * into r;
    end if;
    v_status := 'admitted';
  else
    if r.locked and me.admitted_at is null then
      raise exception 'The host locked this meeting.' using errcode = '42501';
    end if;
    if r.started_at is null then
      v_status := 'waiting';                       -- wait for the host to start
    elsif me.admitted_at is not null then
      v_status := 'admitted';                      -- let in before: coming back after a drop
    elsif r.waiting_room then
      v_status := 'waiting';
    else
      v_status := 'admitted';
    end if;
    if v_status = 'admitted' and coalesce(me.status, '') <> 'admitted'
       and private.meet_live_count(r.id) >= r.max_participants then
      raise exception 'This meeting is full.' using errcode = '54000';
    end if;
  end if;

  insert into public.meet_participants as p (room_id, user_id, display_name, is_guest, role, status, admitted_at)
  values (r.id, v_uid, v_name, v_guest, case when r.host_id = v_uid then 'host' else 'member' end, v_status,
          case when v_status = 'admitted' then now() end)
  on conflict (room_id, user_id) do update set
    display_name = excluded.display_name,
    status = excluded.status,
    admitted_at = coalesce(p.admitted_at, excluded.admitted_at),
    role = case when p.role = 'cohost' then 'cohost' else excluded.role end,
    left_at = null, sfu_session = null, tracks = '[]'::jsonb, audio_on = false, video_on = false, screen_on = false,
    hand_raised_at = null, joined_at = case when p.status = 'admitted' then p.joined_at else now() end
  returning * into me;
  insert into public.meet_presence (participant_id, room_id) values (me.id, r.id)
  on conflict (participant_id) do update set last_seen_at = now();

  return jsonb_build_object('participant_id', me.id, 'room_id', r.id, 'status', me.status, 'role', me.role,
                            'name', me.display_name, 'ends_at', r.ends_at, 'server_time', now());
end $$;

-- Heartbeat + my state. p_patch may hold: audio_on, video_on, screen_on, hand (bool), tracks, sfu_session.
create or replace function public.meet_ping(p_room uuid, p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.meet_participants;
  r public.meet_rooms;
begin
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'You are not in this meeting' using errcode = '42501'; end if;
  select * into r from public.meet_rooms where id = p_room;
  -- A waiting person may still be let in once the host starts (no waiting room).
  if me.status = 'waiting' and r.started_at is not null and not r.waiting_room and not r.locked
     and private.meet_live_count(r.id) < r.max_participants then
    update public.meet_participants set status = 'admitted', joined_at = now(), admitted_at = coalesce(admitted_at, now())
    where id = me.id returning * into me;
  end if;
  update public.meet_presence set last_seen_at = now() where participant_id = me.id;
  if me.status = 'admitted' and p_patch <> '{}'::jsonb then
    if p_patch ? 'tracks' and (jsonb_typeof(p_patch -> 'tracks') <> 'array' or jsonb_array_length(p_patch -> 'tracks') > 4
       or octet_length((p_patch -> 'tracks')::text) > 2000) then
      raise exception 'Bad track list' using errcode = '22023';
    end if;
    update public.meet_participants set
      audio_on = coalesce((p_patch ->> 'audio_on')::boolean, audio_on),
      video_on = coalesce((p_patch ->> 'video_on')::boolean, video_on),
      screen_on = coalesce((p_patch ->> 'screen_on')::boolean, screen_on),
      hand_raised_at = case when p_patch ? 'hand' then (case when (p_patch ->> 'hand')::boolean then coalesce(hand_raised_at, now()) end) else hand_raised_at end,
      tracks = coalesce(p_patch -> 'tracks', tracks),
      sfu_session = case when p_patch ? 'sfu_session' then left(p_patch ->> 'sfu_session', 100) else sfu_session end
    where id = me.id returning * into me;
  end if;
  return jsonb_build_object('status', me.status, 'role', me.role, 'ends_at', r.ends_at, 'ended', r.ended_at is not null,
                            'locked', r.locked, 'waiting_room', r.waiting_room, 'server_time', now());
end $$;

-- Chat message or reaction from someone in the meeting.
create or replace function public.meet_send(p_room uuid, p_kind text, p_body text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me public.meet_participants;
  v_id bigint;
begin
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid() and status = 'admitted';
  if not found then raise exception 'You are not in this meeting' using errcode = '42501'; end if;
  if p_kind = 'chat' then
    if char_length(trim(coalesce(p_body, ''))) = 0 or char_length(p_body) > 2000 then
      raise exception 'Write a message (up to 2,000 characters)' using errcode = '22023';
    end if;
  elsif p_kind = 'reaction' then
    if p_body not in ('👍', '❤️', '😂', '👏', '🎉', '😮', '🙏', '🔥') then raise exception 'Unknown reaction' using errcode = '22023'; end if;
    if (select count(*) from public.meet_events where sender_id = me.id and kind = 'reaction' and created_at > now() - interval '10 seconds') >= 10 then
      raise exception 'Slow down a little' using errcode = '54000';
    end if;
  else
    raise exception 'Unknown message type' using errcode = '22023';
  end if;
  insert into public.meet_events (room_id, sender_id, kind, body) values (p_room, me.id, p_kind, p_body) returning id into v_id;
  return v_id;
end $$;

-- Host and co-host controls.
--   admit, deny, admit_all, remove, mute, mute_all, stop_screen, lower_hand, make_cohost, remove_cohost,
--   lock, unlock, waiting_room_on, waiting_room_off, end
create or replace function public.meet_moderate(p_room uuid, p_action text, p_target uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me public.meet_participants;
  t public.meet_participants;
begin
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid() and status = 'admitted';
  if not found or me.role not in ('host', 'cohost') then
    raise exception 'Only the host can do that' using errcode = '42501';
  end if;
  if p_target is not null then
    select * into t from public.meet_participants where id = p_target and room_id = p_room;
    if not found then raise exception 'That person isn''t in this meeting' using errcode = 'P0002'; end if;
    if t.role = 'host' and p_action in ('remove', 'deny', 'remove_cohost') then
      raise exception 'The host can''t be removed' using errcode = '42501';
    end if;
  elsif p_action in ('admit', 'deny', 'remove', 'mute', 'stop_screen', 'lower_hand', 'make_cohost', 'remove_cohost') then
    raise exception 'Choose a person' using errcode = '22023';
  end if;
  if p_action in ('make_cohost', 'remove_cohost', 'end') and me.role <> 'host' then
    raise exception 'Only the host can do that' using errcode = '42501';
  end if;

  case p_action
    when 'admit' then update public.meet_participants set status = 'admitted', joined_at = now(), admitted_at = coalesce(admitted_at, now())
      where id = t.id and status = 'waiting';
    when 'deny' then update public.meet_participants set status = 'denied' where id = t.id and status = 'waiting';
    when 'admit_all' then update public.meet_participants set status = 'admitted', joined_at = now(), admitted_at = coalesce(admitted_at, now())
      where room_id = p_room and status = 'waiting';
    when 'remove' then
      update public.meet_participants set status = 'removed', left_at = now(), tracks = '[]'::jsonb, sfu_session = null where id = t.id;
      insert into public.meet_events (room_id, sender_id, kind, target_id) values (p_room, me.id, 'remove', t.id);
    when 'mute' then insert into public.meet_events (room_id, sender_id, kind, target_id) values (p_room, me.id, 'mute', t.id);
    when 'mute_all' then insert into public.meet_events (room_id, sender_id, kind) values (p_room, me.id, 'mute');
    when 'stop_screen' then insert into public.meet_events (room_id, sender_id, kind, target_id) values (p_room, me.id, 'stop_screen', t.id);
    when 'lower_hand' then
      update public.meet_participants set hand_raised_at = null where id = t.id;
      insert into public.meet_events (room_id, sender_id, kind, target_id) values (p_room, me.id, 'lower_hand', t.id);
    when 'make_cohost' then update public.meet_participants set role = 'cohost' where id = t.id and role = 'member' and not is_guest;
    when 'remove_cohost' then update public.meet_participants set role = 'member' where id = t.id and role = 'cohost';
    when 'lock' then update public.meet_rooms set locked = true where id = p_room;
    when 'unlock' then update public.meet_rooms set locked = false where id = p_room;
    when 'waiting_room_on' then update public.meet_rooms set waiting_room = true where id = p_room;
    when 'waiting_room_off' then update public.meet_rooms set waiting_room = false where id = p_room;
    when 'end' then
      update public.meet_rooms set ended_at = now() where id = p_room and ended_at is null;
      update public.meet_participants set status = 'left', left_at = now(), tracks = '[]'::jsonb, sfu_session = null
        where room_id = p_room and status in ('admitted', 'waiting');
      insert into public.meet_events (room_id, sender_id, kind) values (p_room, me.id, 'end');
    else raise exception 'Unknown action' using errcode = '22023';
  end case;
end $$;

create or replace function public.meet_leave(p_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.meet_participants set status = 'left', left_at = now(), tracks = '[]'::jsonb, sfu_session = null,
    audio_on = false, video_on = false, screen_on = false, hand_raised_at = null
  where room_id = p_room and user_id = auth.uid() and status in ('admitted', 'waiting');
end $$;

-- For the media server routes: may this person use media in this meeting right now,
-- and which media sessions belong to people in it (the only ones they may pull)?
create or replace function public.meet_media_check(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.meet_rooms;
  me public.meet_participants;
begin
  select * into r from public.meet_rooms where id = p_room;
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid();
  if r.id is null or me.id is null or me.status <> 'admitted' or r.ended_at is not null
     or r.started_at is null or r.ends_at <= now() then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true, 'participant_id', me.id, 'my_session', me.sfu_session, 'ends_at', r.ends_at,
    'sessions', coalesce((select jsonb_agg(p.sfu_session) from public.meet_participants p
                          where p.room_id = p_room and p.status = 'admitted' and p.sfu_session is not null), '[]'::jsonb));
end $$;

-- My meetings: hosted (upcoming and recent) and ones I was invited to.
create or replace function public.meet_my_meetings()
returns table (id uuid, code text, title text, starts_at timestamptz, duration_minutes integer,
               started_at timestamptz, ended_at timestamptz, is_host boolean, host_name text, invites integer)
language sql stable security definer set search_path = '' as $$
  select r.id, r.code, r.title, r.starts_at, r.duration_minutes, r.started_at, r.ended_at, r.host_id = auth.uid(),
         coalesce(nullif(pr.full_name, ''), 'Host'),
         (select count(*)::int from public.meet_invites i where i.room_id = r.id)
  from public.meet_rooms r
  left join public.profiles pr on pr.id = r.host_id
  where (r.host_id = auth.uid()
         or exists (select 1 from public.meet_invites i where i.room_id = r.id
                    and i.email = (select email from public.profiles where id = auth.uid())))
    and r.created_at > now() - interval '60 days'
  order by coalesce(r.starts_at, r.created_at) desc
  limit 100
$$;

-- My Meet plan, for the pricing page and the meeting home.
create or replace function public.meet_my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', private.meet_tier(auth.uid()),
    'pro_price_kobo', private.meet_price_kobo('pro'),
    'business_price_kobo', private.meet_price_kobo('business'),
    'paid_until', (select max(s.period_end) from public.meet_subscriptions s
                   where s.user_id = auth.uid() and s.status = 'success' and s.period_end > now()),
    'org_id', (select m.organization_id from public.memberships m where m.user_id = auth.uid() and m.status = 'active' limit 1),
    'is_org_admin', exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin'))
  )
$$;

-- Start a Meet payment (the server then sends the person to Paystack). The price is set here.
create or replace function public.meet_start_payment(p_plan text, p_months integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_amount integer;
  v_ref text;
begin
  if v_uid is null or private.meet_is_anonymous() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_plan not in ('pro', 'business') or p_months not in (1, 3, 6, 12) then
    raise exception 'Choose a plan and 1, 3, 6 or 12 months' using errcode = '22023';
  end if;
  if p_plan = 'business' then
    select m.organization_id into v_org from public.memberships m
    where m.user_id = v_uid and m.status = 'active' and m.role in ('owner', 'admin') limit 1;
    if v_org is null then
      raise exception 'Meet Business is for Workbase companies. Create your company first, as its owner or admin.' using errcode = '42501';
    end if;
  end if;
  v_amount := private.meet_price_kobo(p_plan) * (case when p_months = 12 then 10 else p_months end);
  v_ref := 'meet_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.meet_subscriptions (user_id, organization_id, plan, months, amount_kobo, reference)
  values (v_uid, v_org, p_plan, p_months, v_amount, v_ref);
  return jsonb_build_object('reference', v_ref, 'amount_kobo', v_amount,
                            'email', (select email from public.profiles where id = v_uid));
end $$;

-- Server only (service role, after Paystack confirms): mark paid; periods stack after the current one.
create or replace function public.meet_confirm_payment(p_reference text, p_amount_kobo integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  s public.meet_subscriptions;
  v_start timestamptz;
begin
  select * into s from public.meet_subscriptions where reference = p_reference for update;
  if not found then return false; end if;
  if s.status = 'success' then return true; end if;
  if p_amount_kobo < s.amount_kobo then
    update public.meet_subscriptions set status = 'failed' where id = s.id;
    return false;
  end if;
  select greatest(now(), coalesce(max(x.period_end), now())) into v_start from public.meet_subscriptions x
  where x.status = 'success' and x.plan = s.plan
    and (case when s.plan = 'pro' then x.user_id = s.user_id else x.organization_id = s.organization_id end);
  update public.meet_subscriptions set status = 'success', period_start = v_start,
    period_end = v_start + make_interval(months => s.months) where id = s.id;
  return true;
end $$;

-- Every 5 minutes: close meetings past their limit or empty for 15 minutes, and drop stale people.
create or replace function private.meet_housekeeping()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.meet_participants p set status = 'left', left_at = now(), tracks = '[]'::jsonb, sfu_session = null
  from public.meet_presence s
  where s.participant_id = p.id and p.status in ('admitted', 'waiting') and s.last_seen_at < now() - interval '2 minutes';

  with closed as (
    update public.meet_rooms r set ended_at = least(now(), coalesce(r.ends_at, now()))
    where r.ended_at is null and r.started_at is not null
      and (r.ends_at <= now()
           or (r.started_at < now() - interval '15 minutes' and not exists (
                 select 1 from public.meet_participants p join public.meet_presence s on s.participant_id = p.id
                 where p.room_id = r.id and p.status = 'admitted' and s.last_seen_at > now() - interval '15 minutes')))
    returning r.id
  )
  select count(*) into v_n from closed;
  -- Old chat and presence go after 30 days; the meetings list keeps 60 days.
  delete from public.meet_events where created_at < now() - interval '30 days';
  delete from public.meet_rooms where created_at < now() - interval '90 days' and (ended_at is not null or starts_at < now() - interval '30 days');
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function private.meet_is_anonymous(), private.meet_price_kobo(text), private.meet_tier(uuid),
  private.meet_me(uuid), private.meet_new_code(), private.meet_live_count(uuid),
  private.meet_housekeeping() from public, anon, authenticated;
revoke execute on function private.meet_can_see(uuid), private.meet_is_moderator(uuid) from public, anon;
grant execute on function private.meet_can_see(uuid), private.meet_is_moderator(uuid) to authenticated;

revoke execute on function public.meet_create(text, timestamptz, integer, boolean, boolean, text[]),
  public.meet_room_info(text), public.meet_join(text, text), public.meet_ping(uuid, jsonb),
  public.meet_send(uuid, text, text), public.meet_moderate(uuid, text, uuid), public.meet_leave(uuid),
  public.meet_media_check(uuid), public.meet_my_meetings(), public.meet_my_plan(),
  public.meet_start_payment(text, integer) from public, anon;
grant execute on function public.meet_create(text, timestamptz, integer, boolean, boolean, text[]),
  public.meet_room_info(text), public.meet_join(text, text), public.meet_ping(uuid, jsonb),
  public.meet_send(uuid, text, text), public.meet_moderate(uuid, text, uuid), public.meet_leave(uuid),
  public.meet_media_check(uuid), public.meet_my_meetings(), public.meet_my_plan(),
  public.meet_start_payment(text, integer) to authenticated;
-- The lobby shows the meeting's name before a guest signs in (anyone with the link).
grant execute on function public.meet_room_info(text) to anon;
revoke execute on function public.meet_confirm_payment(text, integer) from public, anon, authenticated;
grant execute on function public.meet_confirm_payment(text, integer) to service_role;

-- Live updates for people in a meeting (RLS applies to Realtime too).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.meet_participants, public.meet_events, public.meet_rooms;
  end if;
end $$;

select cron.schedule('meet-housekeeping', '*/5 * * * *', $$select private.meet_housekeeping()$$);
