-- Clock in and out from a phone (the dashboard in a phone browser, installable as an app).
--
-- A phone has no keyboard/mouse activity to measure, so phone time is stored separately:
--   work_sessions.source = 'phone'; when the session ends, its time is written to
--   activity_blocks.field_seconds (10-minute blocks, like the desktop app). Worked time counts
--   it; activity % (active ÷ worked) leaves it out.
-- Location: only at the moment of clocking in and out, never in between. Company setting
-- organizations.settings.phone_location = 'off' | 'ask' (default) | 'required';
-- settings.phone_clock = false switches phone clock-in off for the company.
-- Phone sessions are closed after 12 hours if nobody clocks out; a desktop clock-in ends an
-- open phone session at that moment.

alter table public.work_sessions
  add column source text not null default 'desktop' check (source in ('desktop', 'phone')),
  add column start_location jsonb check (start_location is null or (jsonb_typeof(start_location) = 'object' and pg_column_size(start_location) < 300)),
  add column end_location jsonb check (end_location is null or (jsonb_typeof(end_location) = 'object' and pg_column_size(end_location) < 300));

alter table public.activity_blocks
  add column field_seconds integer not null default 0 check (field_seconds between 0 and 600);

-- A position from the browser, rounded to about 1 metre; null if missing or out of range.
create or replace function private.location(p_lat double precision, p_lng double precision, p_accuracy double precision)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then null
    else jsonb_build_object('lat', round(p_lat::numeric, 5), 'lng', round(p_lng::numeric, 5),
                            'accuracy', case when p_accuracy between 0 and 100000 then round(p_accuracy::numeric) end)
  end;
$$;

-- Write a finished phone session into 10-minute blocks.
create or replace function private.write_phone_blocks(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.work_sessions;
begin
  select * into s from public.work_sessions where id = p_session;
  if not found or s.source <> 'phone' or s.ended_at is null or s.ended_at <= s.started_at then
    return;
  end if;
  insert into public.activity_blocks (session_id, block_start, organization_id, user_id, field_seconds, updated_at)
  select s.id, b.start, s.organization_id, s.user_id, b.secs, now()
  from (
    select g as start,
           extract(epoch from least(g + interval '10 minutes', s.ended_at) - greatest(g, s.started_at))::int as secs
    from generate_series(to_timestamp(floor(extract(epoch from s.started_at) / 600) * 600),
                         s.ended_at - interval '1 microsecond', interval '10 minutes') g
  ) b
  where b.secs > 0
  on conflict (session_id, block_start) do update
    set field_seconds = excluded.field_seconds, updated_at = now();
end $$;

-- Phone sessions: a desktop clock-in (which marks other open sessions 'superseded') ends them now,
-- not at their last heartbeat; nobody can stretch one past 12 hours.
create or replace function private.guard_phone_session_end()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.source = 'phone' and old.ended_at is null and new.ended_at is not null then
    if new.end_reason = 'superseded' then
      new.ended_at := now();
    end if;
    new.ended_at := least(greatest(new.ended_at, old.started_at), old.started_at + interval '12 hours');
  end if;
  new.source := old.source;
  return new;
end $$;

create trigger work_sessions_phone_end before update on public.work_sessions
  for each row execute function private.guard_phone_session_end();

create or replace function private.after_phone_session_end()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'phone' and old.ended_at is null and new.ended_at is not null then
    perform private.write_phone_blocks(new.id);
  end if;
  return null;
end $$;

create trigger work_sessions_phone_blocks after update on public.work_sessions
  for each row execute function private.after_phone_session_end();

-- Clock in or out from the phone.
create or replace function public.phone_clock(
  p_action text, p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  me    record;
  mode  text;
  loc   jsonb;
  open_s public.work_sessions;
  new_id uuid;
begin
  select * into me from private.require_active_member();
  if coalesce((me.settings ->> 'phone_clock')::boolean, true) = false then
    raise exception 'Your company has turned off clocking in from a phone' using errcode = '42501';
  end if;
  mode := coalesce(me.settings ->> 'phone_location', 'ask');
  loc := case when mode = 'off' then null else private.location(p_lat, p_lng, p_accuracy) end;
  if mode = 'required' and loc is null then
    raise exception 'Your company needs your location to clock in or out. Allow location for this site and try again' using errcode = '22023';
  end if;

  select * into open_s from public.work_sessions
  where user_id = uid and ended_at is null
  order by (source = 'phone') desc, started_at desc
  limit 1;

  if p_action = 'in' then
    if not private.member_can_track(me.organization_id, uid) then
      raise exception 'Your company''s plan doesn''t cover you yet, so you can''t clock in. Ask your company admin' using errcode = '42501';
    end if;
    if open_s.id is not null and open_s.source = 'phone' then
      return jsonb_build_object('ok', true, 'session_id', open_s.id, 'started_at', open_s.started_at, 'already', true);
    end if;
    if open_s.id is not null and coalesce(open_s.last_heartbeat_at, open_s.started_at) > now() - interval '3 minutes' then
      raise exception 'You''re clocked in on your computer. Clock out there first' using errcode = '55000';
    end if;
    -- A desktop session left open (laptop closed without clocking out) ends at its last sign of life.
    update public.work_sessions
    set ended_at = greatest(started_at, coalesce(last_heartbeat_at, started_at)), end_reason = 'superseded'
    where user_id = uid and ended_at is null and source = 'desktop';

    insert into public.work_sessions (id, organization_id, user_id, started_at, source, last_heartbeat_at, last_state, current_app, start_location)
    values (gen_random_uuid(), me.organization_id, uid, now(), 'phone', now(), 'active', 'Phone', loc)
    returning id into new_id;
    return jsonb_build_object('ok', true, 'session_id', new_id, 'started_at', now());

  elsif p_action = 'out' then
    if open_s.id is null or open_s.source <> 'phone' then
      if open_s.id is not null then
        raise exception 'You clocked in on your computer. Clock out in the desktop app' using errcode = '55000';
      end if;
      raise exception 'You''re not clocked in' using errcode = '55000';
    end if;
    update public.work_sessions
    set ended_at = now(), end_reason = 'clock_out', end_location = loc
    where id = open_s.id;
    return jsonb_build_object('ok', true, 'session_id', open_s.id,
                              'seconds', extract(epoch from least(now(), open_s.started_at + interval '12 hours') - open_s.started_at)::int);
  end if;
  raise exception 'Unknown action' using errcode = '22023';
end $$;

revoke execute on function public.phone_clock(text, double precision, double precision, double precision) from public, anon;
grant execute on function public.phone_clock(text, double precision, double precision, double precision) to authenticated;
revoke execute on function private.write_phone_blocks(uuid) from public, anon, authenticated;

-- Lost-session job: desktop sessions as before; phone sessions after 12 hours.
create or replace function private.close_lost_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; p integer;
begin
  update public.work_sessions w
  set ended_at = least(now(), greatest(
        w.started_at,
        coalesce(w.last_heartbeat_at, w.started_at),
        coalesce((select max(b.block_start) + interval '10 minutes'
                  from public.activity_blocks b where b.session_id = w.id), w.started_at))),
      end_reason = 'agent_lost'
  where w.ended_at is null and w.source = 'desktop'
    and coalesce(w.last_heartbeat_at, w.started_at) < now() - interval '30 minutes';
  get diagnostics n = row_count;

  update public.work_sessions w
  set ended_at = w.started_at + interval '12 hours', end_reason = 'agent_lost'
  where w.ended_at is null and w.source = 'phone' and w.started_at < now() - interval '12 hours';
  get diagnostics p = row_count;
  return n + p;
end $$;

-- Totals per day including phone time (phone_seconds, also part of tracked_seconds).
-- A new name instead of changing member_day_stats (whose result columns can't change in place);
-- the dashboard uses this one from now on.
create or replace function public.member_day_totals(p_from date, p_to date)
returns table (user_id uuid, work_date date, tracked_seconds bigint, active_seconds bigint, phone_seconds bigint)
language sql stable security invoker set search_path = '' as $$
  select d.user_id, d.work_date, d.tracked_seconds, d.active_seconds, d.phone_seconds
  from (
    select b.user_id,
           (b.block_start at time zone m.timezone)::date as work_date,
           sum(b.active_seconds + b.idle_seconds + b.field_seconds)::bigint as tracked_seconds,
           sum(b.active_seconds)::bigint as active_seconds,
           sum(b.field_seconds)::bigint as phone_seconds
    from public.activity_blocks b
    join public.memberships m on m.user_id = b.user_id and m.organization_id = b.organization_id
    where b.block_start >= (p_from::timestamp - interval '1 day') at time zone 'UTC'
      and b.block_start <  (p_to::timestamp + interval '2 days') at time zone 'UTC'
    group by 1, 2
  ) d
  where d.work_date between p_from and p_to;
$$;
revoke execute on function public.member_day_totals(date, date) from public, anon;
grant execute on function public.member_day_totals(date, date) to authenticated;

-- "Working now" dots in chat: phone sessions count while open.
create or replace function public.online_member_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct s.user_id), '{}')
  from public.work_sessions s
  where s.organization_id = private.current_org_id() and s.ended_at is null
    and (s.source = 'phone' or coalesce(s.last_heartbeat_at, s.started_at) > now() - interval '3 minutes');
$$;
