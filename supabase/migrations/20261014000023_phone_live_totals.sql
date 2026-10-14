-- Day totals also count a phone session that is still running (its blocks are only written at
-- clock-out), so "hours today" moves while someone is clocked in on their phone.

create or replace function public.member_day_totals(p_from date, p_to date)
returns table (user_id uuid, work_date date, tracked_seconds bigint, active_seconds bigint, phone_seconds bigint)
language sql stable security invoker set search_path = '' as $$
  with blocks as (
    select b.user_id, b.organization_id, b.block_start,
           b.active_seconds, b.idle_seconds, b.field_seconds
    from public.activity_blocks b
    where b.block_start >= (p_from::timestamp - interval '1 day') at time zone 'UTC'
      and b.block_start <  (p_to::timestamp + interval '2 days') at time zone 'UTC'
    union all
    -- running phone sessions, cut into 10-minute blocks up to now (at most 12 hours)
    select s.user_id, s.organization_id, g,
           0, 0,
           extract(epoch from least(g + interval '10 minutes', now(), s.started_at + interval '12 hours') - greatest(g, s.started_at))::int
    from public.work_sessions s
    cross join lateral generate_series(
      to_timestamp(floor(extract(epoch from s.started_at) / 600) * 600),
      least(now(), s.started_at + interval '12 hours') - interval '1 microsecond',
      interval '10 minutes') g
    where s.source = 'phone' and s.ended_at is null
      and s.started_at < (p_to::timestamp + interval '2 days') at time zone 'UTC'
  )
  select d.user_id, d.work_date, d.tracked_seconds, d.active_seconds, d.phone_seconds
  from (
    select b.user_id,
           (b.block_start at time zone m.timezone)::date as work_date,
           sum(b.active_seconds + b.idle_seconds + greatest(b.field_seconds, 0))::bigint as tracked_seconds,
           sum(b.active_seconds)::bigint as active_seconds,
           sum(greatest(b.field_seconds, 0))::bigint as phone_seconds
    from blocks b
    join public.memberships m on m.user_id = b.user_id and m.organization_id = b.organization_id
    group by 1, 2
  ) d
  where d.work_date between p_from and p_to;
$$;
