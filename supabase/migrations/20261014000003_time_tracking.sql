-- =====================================================================
-- Phase 2 · Time tracking: devices, work sessions, 10-minute activity
-- blocks, app usage and idle periods, written ONLY by the desktop agent
-- through three functions:
--
--   register_device()  when the agent logs in
--   heartbeat()        every minute (live status + latest settings)
--   ingest_batch()     every ~2 minutes (queued data, safe to resend)
--
-- Reading follows the visibility rule:
--   worker  -> own data
--   manager -> own data + people in their team (or teams they manage)
--   admin / owner -> everyone in the company
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.devices (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  install_id           text not null check (char_length(install_id) between 16 and 64),
  name                 text not null default '' check (char_length(name) <= 120),
  os                   text not null default '' check (char_length(os) <= 60),
  agent_version        text not null default '' check (char_length(agent_version) <= 40),
  clock_offset_seconds integer not null default 0,
  last_seen_at         timestamptz,
  revoked_at           timestamptz,
  created_at           timestamptz not null default now(),
  unique (user_id, install_id)
);
create index devices_org_user_idx on public.devices (organization_id, user_id);

-- One row per clock-in -> clock-out. The id is created by the agent so it
-- can clock in while offline.
create table public.work_sessions (
  id                uuid primary key,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  device_id         uuid references public.devices (id) on delete set null,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  end_reason        text check (end_reason in ('clock_out', 'idle_timeout', 'agent_restart', 'agent_lost', 'superseded', 'admin')),
  last_heartbeat_at timestamptz,
  last_state        text check (last_state in ('active', 'idle')),
  current_app       text check (char_length(current_app) <= 120),
  created_at        timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index work_sessions_org_user_start_idx on public.work_sessions (organization_id, user_id, started_at desc);
create index work_sessions_open_idx on public.work_sessions (user_id) where ended_at is null;
create index work_sessions_device_idx on public.work_sessions (device_id);

-- Activity per 10-minute block (block_start is aligned to :00, :10, :20 ...).
--   active_seconds   keyboard/mouse used
--   idle_seconds     at the computer but no input, still counted as work
--   excluded_seconds idle time the worker discarded (not counted)
create table public.activity_blocks (
  session_id       uuid not null references public.work_sessions (id) on delete cascade,
  block_start      timestamptz not null check (extract(epoch from block_start)::bigint % 600 = 0),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  active_seconds   integer not null default 0 check (active_seconds between 0 and 600),
  idle_seconds     integer not null default 0 check (idle_seconds between 0 and 600),
  excluded_seconds integer not null default 0 check (excluded_seconds between 0 and 600),
  updated_at       timestamptz not null default now(),
  primary key (session_id, block_start)
);
create index activity_blocks_org_user_time_idx on public.activity_blocks (organization_id, user_id, block_start);

-- Seconds per app (and window title) within a block.
create table public.app_usage (
  session_id      uuid not null,
  block_start     timestamptz not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  app_name        text not null check (char_length(app_name) between 1 and 120),
  window_title    text not null default '' check (char_length(window_title) <= 300),
  seconds         integer not null check (seconds between 0 and 600),
  primary key (session_id, block_start, app_name, window_title),
  foreign key (session_id, block_start) references public.activity_blocks (session_id, block_start) on delete cascade
);
create index app_usage_org_user_time_idx on public.app_usage (organization_id, user_id, block_start);

-- Stretches of no input longer than the company's idle timeout, and what
-- the worker decided ("I was in a meeting" = kept, otherwise discarded).
create table public.idle_periods (
  id              uuid primary key,
  session_id      uuid not null references public.work_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  decision        text not null default 'pending' check (decision in ('pending', 'kept', 'discarded')),
  reason          text check (char_length(reason) <= 200),
  check (ended_at is null or ended_at >= started_at)
);
create index idle_periods_session_idx on public.idle_periods (session_id);
create index idle_periods_org_user_idx on public.idle_periods (organization_id, user_id, started_at);

-- Batches already received, so a resent batch is ignored.
create table public.ingested_batches (
  id                   uuid primary key,
  device_id            uuid references public.devices (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  received_at          timestamptz not null default now(),
  clock_offset_seconds integer not null default 0
);
create index ingested_batches_received_idx on public.ingested_batches (received_at);
create index ingested_batches_device_idx on public.ingested_batches (device_id);
create index ingested_batches_user_idx on public.ingested_batches (user_id);

-- ---------------------------------------------------------------------
-- Visibility helper: the people whose tracking data the caller may see.
-- Returned as one array so policies evaluate it once per query.
-- ---------------------------------------------------------------------
create or replace function private.visible_member_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(them.user_id), '{}')
  from public.memberships me
  join public.memberships them on them.organization_id = me.organization_id
  where me.user_id = auth.uid()
    and me.status = 'active'
    and (
      them.user_id = me.user_id
      or me.role in ('owner', 'admin')
      or (me.role = 'manager' and (
            them.team_id = me.team_id
            or them.team_id in (select t.id from public.teams t where t.manager_id = me.user_id)))
    );
$$;

-- ---------------------------------------------------------------------
-- Agent functions
-- ---------------------------------------------------------------------

-- The caller's active membership plus company settings, or an error.
create or replace function private.require_active_member()
returns table (organization_id uuid, role public.member_role, timezone text, settings jsonb, org_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;
  return query
    select m.organization_id, m.role, m.timezone, o.settings, o.name
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and m.status = 'active';
  if not found then
    raise exception 'Your account is not active in any company' using errcode = '42501';
  end if;
end $$;

-- Called when the agent logs in. Returns everything the agent needs to start.
create or replace function public.register_device(
  p_install_id text, p_name text, p_os text, p_agent_version text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me  record;
  dev public.devices;
  v_name text;
begin
  select * into me from private.require_active_member();

  select * into dev from public.devices where user_id = uid and install_id = p_install_id;
  if found and dev.revoked_at is not null then
    raise exception 'This computer was disconnected by your admin' using errcode = '42501';
  end if;

  insert into public.devices (organization_id, user_id, install_id, name, os, agent_version, last_seen_at)
  values (me.organization_id, uid, p_install_id, left(coalesce(p_name, ''), 120),
          left(coalesce(p_os, ''), 60), left(coalesce(p_agent_version, ''), 40), now())
  on conflict (user_id, install_id) do update
    set organization_id = excluded.organization_id,
        name = excluded.name, os = excluded.os,
        agent_version = excluded.agent_version, last_seen_at = now()
  returning * into dev;

  select p.full_name into v_name from public.profiles p where p.id = uid;

  return jsonb_build_object(
    'device_id',         dev.id,
    'organization_id',   me.organization_id,
    'organization_name', me.org_name,
    'role',              me.role,
    'timezone',          me.timezone,
    'full_name',         coalesce(v_name, ''),
    'settings',          me.settings,
    'server_time',       now()
  );
end $$;

-- Every minute while the agent runs. Keeps "who is working now" live and
-- hands back the latest company settings and the member's status.
create or replace function public.heartbeat(
  p_device_id uuid, p_session_id uuid default null,
  p_state text default null, p_current_app text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me  record;
  dev public.devices;
begin
  if uid is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;

  select m.organization_id, o.settings into me
  from public.memberships m join public.organizations o on o.id = m.organization_id
  where m.user_id = uid and m.status = 'active';
  if not found then
    return jsonb_build_object('active', false, 'server_time', now());
  end if;

  select * into dev from public.devices where id = p_device_id and user_id = uid;
  if not found or dev.revoked_at is not null then
    return jsonb_build_object('active', false, 'device_revoked', true, 'server_time', now());
  end if;

  update public.devices set last_seen_at = now() where id = dev.id;

  if p_session_id is not null then
    update public.work_sessions
    set last_heartbeat_at = now(),
        last_state  = case when p_state in ('active', 'idle') then p_state end,
        current_app = case when coalesce((me.settings ->> 'track_apps')::boolean, true)
                           then left(p_current_app, 120) end
    where id = p_session_id and user_id = uid and ended_at is null;
  end if;

  return jsonb_build_object('active', true, 'settings', me.settings, 'server_time', now());
end $$;

-- Upload queued tracking data. Safe to call again with the same batch:
-- totals are overwritten (the agent always sends running totals) and a
-- repeated batch_id is skipped.
create or replace function public.ingest_batch(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  me         record;
  dev        public.devices;
  v_batch    uuid;
  v_sent     timestamptz;
  v_offset   integer;
  v_track    boolean;
  v_sessions jsonb := coalesce(p_payload -> 'sessions', '[]');
  v_blocks   jsonb := coalesce(p_payload -> 'blocks', '[]');
  v_apps     jsonb := coalesce(p_payload -> 'apps', '[]');
  v_idle     jsonb := coalesce(p_payload -> 'idle_periods', '[]');
begin
  select * into me from private.require_active_member();
  v_track := coalesce((me.settings ->> 'track_apps')::boolean, true);

  if jsonb_typeof(v_sessions) <> 'array' or jsonb_typeof(v_blocks) <> 'array'
     or jsonb_typeof(v_apps) <> 'array' or jsonb_typeof(v_idle) <> 'array' then
    raise exception 'Malformed batch' using errcode = '22023';
  end if;
  if jsonb_array_length(v_sessions) > 200 or jsonb_array_length(v_blocks) > 2000
     or jsonb_array_length(v_apps) > 10000 or jsonb_array_length(v_idle) > 500 then
    raise exception 'Batch too large' using errcode = '54000';
  end if;

  select * into dev from public.devices
  where id = (p_payload ->> 'device_id')::uuid and user_id = uid;
  if not found then
    raise exception 'This computer is not registered. Log in again in the app' using errcode = 'P0002';
  end if;
  if dev.revoked_at is not null then
    raise exception 'This computer was disconnected by your admin' using errcode = '42501';
  end if;

  v_batch  := (p_payload ->> 'batch_id')::uuid;
  v_sent   := coalesce((p_payload ->> 'sent_at')::timestamptz, now());
  v_offset := round(extract(epoch from now() - v_sent));

  insert into public.ingested_batches (id, device_id, user_id, clock_offset_seconds)
  values (v_batch, dev.id, uid, v_offset)
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'server_time', now());
  end if;

  update public.devices set last_seen_at = now(), clock_offset_seconds = v_offset where id = dev.id;

  -- Sessions must not belong to someone else.
  if exists (
    select 1 from jsonb_to_recordset(v_sessions) as s (id uuid)
    join public.work_sessions w on w.id = s.id
    where w.user_id <> uid
  ) then
    raise exception 'Session belongs to another user' using errcode = '42501';
  end if;

  -- A new clock-in closes any session this user left open elsewhere.
  update public.work_sessions w
  set ended_at = greatest(w.started_at, coalesce(w.last_heartbeat_at, w.started_at)),
      end_reason = 'superseded'
  where w.user_id = uid and w.ended_at is null
    and w.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(v_sessions) x)
    and exists (
      select 1 from jsonb_to_recordset(v_sessions) as s (id uuid, started_at timestamptz, ended_at timestamptz)
      where s.ended_at is null and s.started_at > w.started_at
        and not exists (select 1 from public.work_sessions e where e.id = s.id)
    );

  insert into public.work_sessions (id, organization_id, user_id, device_id, started_at, ended_at, end_reason)
  select s.id, me.organization_id, uid, dev.id, s.started_at, s.ended_at,
         case when s.ended_at is not null then coalesce(s.end_reason, 'clock_out') end
  from jsonb_to_recordset(v_sessions) as s (id uuid, started_at timestamptz, ended_at timestamptz, end_reason text)
  where s.started_at > now() - interval '35 days' and s.started_at < now() + interval '10 minutes'
  on conflict (id) do update
    set ended_at = coalesce(excluded.ended_at,
                            case when public.work_sessions.end_reason = 'agent_lost' then null
                                 else public.work_sessions.ended_at end),
        end_reason = case
                       when excluded.ended_at is not null then excluded.end_reason
                       when public.work_sessions.end_reason = 'agent_lost' then null
                       else public.work_sessions.end_reason
                     end
    where public.work_sessions.user_id = uid;

  insert into public.activity_blocks (session_id, block_start, organization_id, user_id,
                                      active_seconds, idle_seconds, excluded_seconds, updated_at)
  select b.session_id, b.block_start, me.organization_id, uid,
         least(greatest(coalesce(b.active, 0), 0), 600),
         least(greatest(coalesce(b.idle, 0), 0), 600),
         least(greatest(coalesce(b.discarded, 0), 0), 600),
         now()
  from jsonb_to_recordset(v_blocks) as b (session_id uuid, block_start timestamptz, active int, idle int, discarded int)
  join public.work_sessions w on w.id = b.session_id and w.user_id = uid
  where extract(epoch from b.block_start)::bigint % 600 = 0
  on conflict (session_id, block_start) do update
    set active_seconds = excluded.active_seconds,
        idle_seconds = excluded.idle_seconds,
        excluded_seconds = excluded.excluded_seconds,
        updated_at = now();

  if v_track then
    insert into public.app_usage (session_id, block_start, organization_id, user_id, app_name, window_title, seconds)
    select a.session_id, a.block_start, me.organization_id, uid,
           left(a.app, 120), left(coalesce(a.title, ''), 300), least(greatest(a.seconds, 0), 600)
    from jsonb_to_recordset(v_apps) as a (session_id uuid, block_start timestamptz, app text, title text, seconds int)
    join public.activity_blocks ab on ab.session_id = a.session_id and ab.block_start = a.block_start and ab.user_id = uid
    where coalesce(a.app, '') <> ''
    on conflict (session_id, block_start, app_name, window_title) do update
      set seconds = excluded.seconds;
  end if;

  insert into public.idle_periods (id, session_id, organization_id, user_id, started_at, ended_at, decision, reason)
  select i.id, i.session_id, me.organization_id, uid, i.started_at, i.ended_at,
         case when i.decision in ('pending', 'kept', 'discarded') then i.decision else 'pending' end,
         left(i.reason, 200)
  from jsonb_to_recordset(v_idle) as i (id uuid, session_id uuid, started_at timestamptz, ended_at timestamptz, decision text, reason text)
  join public.work_sessions w on w.id = i.session_id and w.user_id = uid
  on conflict (id) do update
    set ended_at = excluded.ended_at, decision = excluded.decision, reason = excluded.reason
    where public.idle_periods.user_id = uid;

  return jsonb_build_object('ok', true, 'server_time', now());
end $$;

-- ---------------------------------------------------------------------
-- Reporting (SECURITY INVOKER: row-level security decides what is seen)
-- ---------------------------------------------------------------------

-- Tracked and active seconds per person per LOCAL work day (their own time zone).
create or replace function public.member_day_stats(p_from date, p_to date)
returns table (user_id uuid, work_date date, tracked_seconds bigint, active_seconds bigint)
language sql stable security invoker set search_path = '' as $$
  select d.user_id, d.work_date, d.tracked_seconds, d.active_seconds
  from (
    select b.user_id,
           (b.block_start at time zone m.timezone)::date as work_date,
           sum(b.active_seconds + b.idle_seconds)::bigint as tracked_seconds,
           sum(b.active_seconds)::bigint as active_seconds
    from public.activity_blocks b
    join public.memberships m on m.user_id = b.user_id and m.organization_id = b.organization_id
    where b.block_start >= (p_from::timestamp - interval '1 day') at time zone 'UTC'
      and b.block_start <  (p_to::timestamp + interval '2 days') at time zone 'UTC'
    group by 1, 2
  ) d
  where d.work_date between p_from and p_to;
$$;

-- Top apps for one person between two instants.
create or replace function public.member_top_apps(p_user uuid, p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (app_name text, seconds bigint)
language sql stable security invoker set search_path = '' as $$
  select a.app_name, sum(a.seconds)::bigint
  from public.app_usage a
  where a.user_id = p_user and a.block_start >= p_from and a.block_start < p_to
  group by a.app_name
  order by 2 desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------
-- Row-level security: read-only for the app, writes only via functions
-- ---------------------------------------------------------------------
alter table public.devices          enable row level security;
alter table public.work_sessions    enable row level security;
alter table public.activity_blocks  enable row level security;
alter table public.app_usage        enable row level security;
alter table public.idle_periods     enable row level security;
alter table public.ingested_batches enable row level security;

create policy "see devices of visible members" on public.devices
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));

create policy "admins disconnect devices" on public.devices
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

create policy "see sessions of visible members" on public.work_sessions
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));

create policy "see activity of visible members" on public.activity_blocks
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));

create policy "see app usage of visible members" on public.app_usage
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));

create policy "see idle periods of visible members" on public.idle_periods
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));
-- ingested_batches: no policy = nobody reads it through the API.

revoke all on public.devices, public.work_sessions, public.activity_blocks,
              public.app_usage, public.idle_periods, public.ingested_batches
  from anon, authenticated;
grant select on public.devices, public.work_sessions, public.activity_blocks,
                public.app_usage, public.idle_periods
  to authenticated;
grant update (revoked_at) on public.devices to authenticated;

revoke execute on function private.visible_member_ids()    from public, anon;
revoke execute on function private.require_active_member() from public, anon;
grant execute on function private.visible_member_ids() to authenticated;

revoke execute on function public.register_device(text, text, text, text)  from public, anon;
revoke execute on function public.heartbeat(uuid, uuid, text, text)         from public, anon;
revoke execute on function public.ingest_batch(jsonb)                       from public, anon;
revoke execute on function public.member_day_stats(date, date)              from public, anon;
revoke execute on function public.member_top_apps(uuid, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.register_device(text, text, text, text)  to authenticated;
grant execute on function public.heartbeat(uuid, uuid, text, text)         to authenticated;
grant execute on function public.ingest_batch(jsonb)                       to authenticated;
grant execute on function public.member_day_stats(date, date)              to authenticated;
grant execute on function public.member_top_apps(uuid, timestamptz, timestamptz, int) to authenticated;
