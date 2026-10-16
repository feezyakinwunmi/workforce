-- Owner console: growth, money and support for the people who run Workbase (Phantomire).
--
-- * The console reads everything through the functions below, which only the service role may run
--   (the console's server checks the signed-in email against ADMIN_EMAILS first). Nothing here is
--   reachable from a browser with a normal login.
-- * Account information (plan, members, last clock-in, app versions, payments, warnings) is always
--   visible to support. A closer look (time records, sessions, tasks, leave, company changes) needs the
--   company's owner or an admin to switch on "Allow support access" for 1–7 days, and every closer look
--   is logged where the company can see it. Chats, notes, screenshots, pay and staff records are never
--   shown to support, with or without access.
-- * Meetings are deleted 7 days after they end, so Meet usage is kept as daily counts only
--   (admin_meet_daily: no names, no codes).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.admin_meet_daily (
  day      date primary key,          -- Lagos date the meeting started
  meetings integer not null default 0,
  minutes  integer not null default 0,
  people   integer not null default 0,
  guests   integer not null default 0
);

create table if not exists public.support_access (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  granted_by      uuid references auth.users (id) on delete set null,
  granted_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);

create table if not exists public.support_views (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  viewer          text not null check (char_length(viewer) <= 200),
  section         text not null check (char_length(section) <= 60),
  created_at      timestamptz not null default now()
);
create index if not exists support_views_org_idx on public.support_views (organization_id, created_at desc);

create table if not exists public.admin_notes (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author          text not null check (char_length(author) <= 200),
  body            text not null check (char_length(trim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index if not exists admin_notes_org_idx on public.admin_notes (organization_id, created_at desc);

alter table public.admin_meet_daily enable row level security;
alter table public.support_access enable row level security;
alter table public.support_views enable row level security;
alter table public.admin_notes enable row level security;
revoke all on public.admin_meet_daily, public.support_access, public.support_views, public.admin_notes from anon, authenticated;

-- The company's owner/admins see whether support access is on, and every closer look support took.
create policy "admins see their support access" on public.support_access for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins see support's looks" on public.support_views for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
grant select on public.support_access, public.support_views to authenticated;

-- ---------------------------------------------------------------------------
-- Meet: count each meeting once when it ends (never blocks ending a meeting)
-- ---------------------------------------------------------------------------
create or replace function private.meet_count_day()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_people integer;
  v_guests integer;
begin
  begin
    select count(*) filter (where p.first_joined_at is not null),
           count(*) filter (where p.first_joined_at is not null and p.is_guest)
      into v_people, v_guests
    from public.meet_participants p where p.room_id = new.id;
    insert into public.admin_meet_daily as d (day, meetings, minutes, people, guests)
    values ((new.started_at at time zone 'Africa/Lagos')::date, 1,
            greatest(0, round(extract(epoch from new.ended_at - new.started_at) / 60))::int, v_people, v_guests)
    on conflict (day) do update set meetings = d.meetings + 1, minutes = d.minutes + excluded.minutes,
      people = d.people + excluded.people, guests = d.guests + excluded.guests;
  exception when others then
    raise warning 'meet_count_day skipped: %', sqlerrm;
  end;
  return null;
end $$;

create or replace trigger meet_rooms_count_day after update of ended_at on public.meet_rooms
  for each row when (old.ended_at is null and new.ended_at is not null and new.started_at is not null)
  execute function private.meet_count_day();

revoke execute on function private.meet_count_day() from public, anon, authenticated;

-- Meetings that already ended (the last 7 days are still kept).
insert into public.admin_meet_daily as d (day, meetings, minutes, people, guests)
select (r.started_at at time zone 'Africa/Lagos')::date, count(*),
       sum(greatest(0, round(extract(epoch from r.ended_at - r.started_at) / 60)))::int,
       coalesce(sum((select count(*) from public.meet_participants p where p.room_id = r.id and p.first_joined_at is not null)), 0)::int,
       coalesce(sum((select count(*) from public.meet_participants p where p.room_id = r.id and p.first_joined_at is not null and p.is_guest)), 0)::int
from public.meet_rooms r
where r.started_at is not null and r.ended_at is not null
group by 1
on conflict (day) do nothing;

-- ---------------------------------------------------------------------------
-- The company's side: switch support access on or off (owner/admins)
-- ---------------------------------------------------------------------------
create or replace function public.grant_support_access(p_days integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_until timestamptz;
begin
  if v_org is null or not private.is_org_admin() then
    raise exception 'Only the owner or an admin can allow support access' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 7 then
    raise exception 'Choose 1 to 7 days' using errcode = '22023';
  end if;
  v_until := now() + make_interval(days => p_days);
  insert into public.support_access (organization_id, granted_by, granted_at, expires_at)
  values (v_org, auth.uid(), now(), v_until)
  on conflict (organization_id) do update set granted_by = excluded.granted_by, granted_at = now(), expires_at = excluded.expires_at;
  perform private.log_audit(v_org, 'support.access_on', 'organization', v_org, jsonb_build_object('until', v_until));
  return v_until;
end $$;

create or replace function public.revoke_support_access()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
begin
  if v_org is null or not private.is_org_admin() then
    raise exception 'Only the owner or an admin can change support access' using errcode = '42501';
  end if;
  update public.support_access set expires_at = least(expires_at, now()) where organization_id = v_org;
  perform private.log_audit(v_org, 'support.access_off', 'organization', v_org, '{}'::jsonb);
end $$;

revoke execute on function public.grant_support_access(integer), public.revoke_support_access() from public, anon;
grant execute on function public.grant_support_access(integer), public.revoke_support_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Console functions (service role only)
-- ---------------------------------------------------------------------------

-- Lagos calendar day of a timestamp.
create or replace function private.lagos_day(t timestamptz)
returns date language sql immutable set search_path = '' as $$ select (t at time zone 'Africa/Lagos')::date $$;

-- Every naira that came in, one row per payment, by product.
create or replace function private.admin_revenue()
returns table (product text, organization_id uuid, user_id uuid, reference text, amount_kobo bigint, paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'workbase_' || p.plan, p.organization_id, p.created_by, p.reference, p.amount_kobo, coalesce(p.paid_at, p.created_at)
    from public.payments p where p.status = 'success' and p.amount_kobo > 0
  union all
  select 'meet_' || s.plan, s.organization_id, s.user_id, s.reference, s.amount_kobo::bigint, coalesce(s.period_start, s.created_at)
    from public.meet_subscriptions s where s.status = 'success'
  union all
  select 'book_pro', null, s.user_id, s.reference, s.amount_kobo::bigint, coalesce(s.period_start, s.created_at)
    from public.book_subscriptions s where s.status = 'success'
  union all
  select 'book_fees', null, pg.owner_id, b.pay_reference, b.fee_kobo::bigint, b.paid_at
    from public.book_bookings b join public.book_pages pg on pg.id = b.page_id
    where b.paid_at is not null and b.fee_kobo > 0
$$;

create or replace function public.admin_overview(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date := private.lagos_day(now()) - (v_days - 1);
  v_since timestamptz := (v_from::timestamp at time zone 'Africa/Lagos');
  v_week timestamptz := now() - interval '7 days';
begin
  return jsonb_build_object(
    'days', v_days,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'accounts', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
      'accounts_7d', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false) and u.created_at > v_week),
      'companies', (select count(*) from public.organizations o where o.closing_at is null),
      'companies_7d', (select count(*) from public.organizations o where o.created_at > v_week),
      'active_companies_7d', (select count(distinct s.organization_id) from public.work_sessions s where s.started_at > v_week),
      'people_tracking_7d', (select count(distinct s.user_id) from public.work_sessions s where s.started_at > v_week),
      'working_now', (select count(*) from public.work_sessions s where s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes'),
      'paying_companies', (select count(*) from public.organizations o cross join lateral private.org_billing(o.id) b where b.tier in ('standard', 'pro')),
      'trial_companies', (select count(*) from public.organizations o where o.trial_ends_at > now() and o.closing_at is null
                            and not exists (select 1 from public.payments p where p.organization_id = o.id and p.status = 'success' and p.period_end > now())),
      'meet_live', (select count(*) from public.meet_rooms r where r.started_at is not null and r.ended_at is null),
      'meet_meetings_7d', (select coalesce(sum(d.meetings), 0) from public.admin_meet_daily d where d.day > private.lagos_day(now()) - 7),
      'meet_minutes_7d', (select coalesce(sum(d.minutes), 0) from public.admin_meet_daily d where d.day > private.lagos_day(now()) - 7),
      'meet_paid_hosts', (select count(distinct s.user_id) from public.meet_subscriptions s where s.status = 'success' and s.period_end > now()),
      'book_pages', (select count(*) from public.book_pages),
      'book_pages_payouts', (select count(*) from public.book_pages where subaccount_code is not null),
      'book_pro', (select count(distinct s.user_id) from public.book_subscriptions s where s.status = 'success' and s.period_end > now()),
      'book_bookings_7d', (select count(*) from public.book_bookings b where b.created_at > v_week and b.status <> 'pending_payment'),
      'failed_payments_7d', (select count(*) from public.payments p where p.status = 'failed' and p.created_at > v_week)
                          + (select count(*) from public.meet_subscriptions s where s.status = 'failed' and s.created_at > v_week)
                          + (select count(*) from public.book_subscriptions s where s.status = 'failed' and s.created_at > v_week)
    ),
    'money', (
      select jsonb_build_object(
        'all_time', coalesce(jsonb_object_agg(x.product, x.total), '{}'::jsonb),
        'this_month', coalesce(jsonb_object_agg(x.product, x.month) filter (where x.month > 0), '{}'::jsonb),
        'last_30_days', coalesce(jsonb_object_agg(x.product, x.d30) filter (where x.d30 > 0), '{}'::jsonb))
      from (
        select r.product, sum(r.amount_kobo) as total,
               sum(r.amount_kobo) filter (where date_trunc('month', r.paid_at at time zone 'Africa/Lagos') = date_trunc('month', now() at time zone 'Africa/Lagos')) as month,
               sum(r.amount_kobo) filter (where r.paid_at > now() - interval '30 days') as d30
        from private.admin_revenue() r group by r.product
      ) x
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'signups', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false) and private.lagos_day(u.created_at) = g.day),
        'companies', (select count(*) from public.organizations o where private.lagos_day(o.created_at) = g.day),
        'active_companies', (select count(distinct s.organization_id) from public.work_sessions s
                              where s.started_at >= (g.day::timestamp at time zone 'Africa/Lagos') and s.started_at < ((g.day + 1)::timestamp at time zone 'Africa/Lagos')),
        'people_tracking', (select count(distinct s.user_id) from public.work_sessions s
                              where s.started_at >= (g.day::timestamp at time zone 'Africa/Lagos') and s.started_at < ((g.day + 1)::timestamp at time zone 'Africa/Lagos')),
        'meetings', coalesce((select d.meetings from public.admin_meet_daily d where d.day = g.day), 0),
        'meet_minutes', coalesce((select d.minutes from public.admin_meet_daily d where d.day = g.day), 0),
        'bookings', (select count(*) from public.book_bookings b where b.status <> 'pending_payment' and private.lagos_day(b.created_at) = g.day),
        'revenue', (select coalesce(jsonb_object_agg(r.product, r.total), '{}'::jsonb) from (
                      select v.product, sum(v.amount_kobo) as total from private.admin_revenue() v
                      where private.lagos_day(v.paid_at) = g.day group by v.product) r)
      ) order by g.day)
      from (select generate_series(v_from, private.lagos_day(now()), interval '1 day')::date as day) g
    ),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from auth.users u where not coalesce(u.is_anonymous, false) and u.created_at >= v_since),
      'created_company', (select count(*) from public.organizations o where o.created_at >= v_since),
      'invited_team', (select count(*) from public.organizations o where o.created_at >= v_since and (
                          exists (select 1 from public.invitations i where i.organization_id = o.id)
                          or (select count(*) from public.memberships m where m.organization_id = o.id) > 1)),
      'first_clock_in', (select count(*) from public.organizations o where o.created_at >= v_since
                          and exists (select 1 from public.work_sessions s where s.organization_id = o.id)),
      'paid', (select count(*) from public.organizations o where o.created_at >= v_since
                and exists (select 1 from public.payments p where p.organization_id = o.id and p.status = 'success' and p.amount_kobo > 0))
    ),
    'trials_ending', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'trial_ends_at', o.trial_ends_at,
               'members', (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
               'last_clock_in', (select max(s.started_at) from public.work_sessions s where s.organization_id = o.id))
             order by o.trial_ends_at)
      from public.organizations o
      where o.closing_at is null and o.trial_ends_at between now() and now() + interval '7 days'
        and not exists (select 1 from public.payments p where p.organization_id = o.id and p.status = 'success' and p.period_end > now())
    ), '[]'::jsonb),
    'recent_payments', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select * from (
          select 'workbase_' || p.plan as product, p.status, p.amount_kobo, coalesce(p.paid_at, p.created_at) as at,
                 o.name as who, o.id as organization_id, p.failure_reason
            from public.payments p join public.organizations o on o.id = p.organization_id
          union all
          select 'meet_' || s.plan, s.status, s.amount_kobo, s.created_at, coalesce(nullif(pr.full_name, ''), pr.email), s.organization_id, null
            from public.meet_subscriptions s left join public.profiles pr on pr.id = s.user_id
          union all
          select 'book_pro', s.status, s.amount_kobo, s.created_at, coalesce(nullif(pr.full_name, ''), pr.email), null, null
            from public.book_subscriptions s left join public.profiles pr on pr.id = s.user_id
        ) all_p where all_p.status <> 'pending' order by all_p.at desc limit 12
      ) x
    ), '[]'::jsonb),
    'app_versions', coalesce((
      select jsonb_agg(jsonb_build_object('version', v.agent_version, 'devices', v.n) order by v.n desc)
      from (select coalesce(nullif(d.agent_version, ''), 'unknown') as agent_version, count(*) as n
            from public.devices d where d.revoked_at is null and d.last_seen_at > now() - interval '14 days' group by 1) v
    ), '[]'::jsonb)
  );
end $$;

-- Company list for search: by company name, slug or anyone's email in it.
create or replace function public.admin_companies(p_q text default '', p_limit integer default 50)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(c order by c.created_at desc), '[]'::jsonb) from (
    select o.id, o.name, o.created_at, o.closing_at, o.trial_ends_at,
           b.tier, b.paid_until, b.active_members,
           (select coalesce(nullif(pr.full_name, ''), pr.email) from public.memberships m join public.profiles pr on pr.id = m.user_id
             where m.organization_id = o.id and m.role = 'owner' limit 1) as owner,
           (select pr.email from public.memberships m join public.profiles pr on pr.id = m.user_id
             where m.organization_id = o.id and m.role = 'owner' limit 1) as owner_email,
           (select count(*) from public.invitations i where i.organization_id = o.id
             and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) as pending_invites,
           (select max(s.started_at) from public.work_sessions s where s.organization_id = o.id) as last_clock_in,
           (select a.expires_at from public.support_access a where a.organization_id = o.id and a.expires_at > now()) as support_until
    from public.organizations o
    cross join lateral private.org_billing(o.id) b
    where coalesce(trim(p_q), '') = ''
       or o.name ilike '%' || trim(p_q) || '%'
       or o.slug ilike '%' || trim(p_q) || '%'
       or exists (select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
                  where m.organization_id = o.id and pr.email ilike '%' || trim(p_q) || '%')
       or exists (select 1 from public.invitations i where i.organization_id = o.id and i.email ilike '%' || trim(p_q) || '%')
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) c
$$;

-- One company's support page. p_deep = the closer look (needs support access; logged).
create or replace function public.admin_company(p_org uuid, p_viewer text, p_deep boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.organizations;
  b record;
  v_access timestamptz;
  v_latest text;
  v_deep jsonb := null;
  v_from timestamptz := now() - interval '14 days';
begin
  select * into o from public.organizations where id = p_org;
  if not found then raise exception 'Company not found' using errcode = 'P0002'; end if;
  select * into b from private.org_billing(o.id);
  select a.expires_at into v_access from public.support_access a where a.organization_id = o.id and a.expires_at > now();

  -- Newest desktop app version seen anywhere in the last 30 days, to spot old installs.
  select d.agent_version into v_latest from public.devices d
  where d.agent_version ~ '^\d+\.\d+\.\d+$' and d.last_seen_at > now() - interval '30 days'
  order by string_to_array(d.agent_version, '.')::int[] desc limit 1;

  if p_deep then
    if v_access is null then
      raise exception 'This company has not allowed support access. Ask the owner to switch it on in Company settings.' using errcode = '42501';
    end if;
    insert into public.support_views (organization_id, viewer, section) values (o.id, left(coalesce(p_viewer, 'support'), 200), 'Time, tasks and leave');
    v_deep := jsonb_build_object(
      'hours', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', h.user_id, 'day', h.day, 'worked_seconds', h.worked, 'active_seconds', h.active) order by h.day, h.user_id)
        from (select a.user_id, private.lagos_day(a.block_start) as day,
                     sum(a.active_seconds + a.idle_seconds) as worked, sum(a.active_seconds) as active
              from public.activity_blocks a where a.organization_id = o.id and a.block_start >= v_from
              group by 1, 2) h), '[]'::jsonb),
      'sessions', coalesce((
        select jsonb_agg(s order by s.started_at desc) from (
          select ws.user_id, ws.started_at, ws.ended_at, ws.end_reason, ws.source, ws.last_heartbeat_at,
                 d.agent_version, d.os
          from public.work_sessions ws left join public.devices d on d.id = ws.device_id
          where ws.organization_id = o.id order by ws.started_at desc limit 40) s), '[]'::jsonb),
      'tasks', (select jsonb_build_object(
                  'by_status', coalesce((select jsonb_object_agg(t.status, t.n) from (
                      select status::text as status, count(*) as n from public.tasks where organization_id = o.id group by 1) t), '{}'::jsonb),
                  'overdue', (select count(*) from public.tasks t where t.organization_id = o.id and t.status <> 'done' and t.due_date < private.lagos_day(now())),
                  'projects', (select count(*) from public.projects p where p.organization_id = o.id))),
      'leave', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', l.user_id, 'type', lt.name, 'start_date', l.start_date, 'end_date', l.end_date,
                                            'days', l.days, 'status', l.status) order by l.start_date desc)
        from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
        where l.organization_id = o.id and l.end_date >= private.lagos_day(now()) - 30), '[]'::jsonb),
      'changes', coalesce((
        select jsonb_agg(jsonb_build_object('at', a.created_at, 'action', a.action, 'by', coalesce(nullif(pr.full_name, ''), pr.email, 'System'))
               order by a.created_at desc)
        from (select * from public.audit_logs where organization_id = o.id order by created_at desc limit 40) a
        left join public.profiles pr on pr.id = a.actor_id), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'company', jsonb_build_object(
      'id', o.id, 'name', o.name, 'slug', o.slug, 'country_code', o.country_code, 'timezone', o.timezone,
      'created_at', o.created_at, 'closing_at', o.closing_at, 'purge_after', o.purge_after,
      'tier', b.tier, 'seat_limit', b.seat_limit, 'paid_seats', b.paid_seats, 'paid_until', b.paid_until,
      'trial_ends_at', o.trial_ends_at, 'active_members', b.active_members,
      'settings', jsonb_build_object(
        'idle_timeout_minutes', o.settings -> 'idle_timeout_minutes',
        'track_window_titles', o.settings -> 'track_window_titles',
        'screenshots_enabled', coalesce((o.settings ->> 'screenshots_enabled')::boolean, false),
        'phone_clock', o.settings -> 'phone_clock',
        'phone_location', o.settings -> 'phone_location',
        'work_start', o.settings -> 'work_start', 'work_end', o.settings -> 'work_end',
        'clock_reminders', o.settings -> 'clock_reminders')
    ),
    'support_until', v_access,
    'latest_agent', v_latest,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'name', coalesce(nullif(pr.full_name, ''), pr.email), 'email', pr.email,
               'role', m.role, 'status', m.status, 'joined_at', m.joined_at, 'timezone', m.timezone,
               'can_track', m.status = 'active' and private.member_can_track(o.id, m.user_id),
               'last_clock_in', (select max(s.started_at) from public.work_sessions s where s.organization_id = o.id and s.user_id = m.user_id),
               'open_session', (select jsonb_build_object('started_at', s.started_at, 'last_heartbeat_at', s.last_heartbeat_at, 'source', s.source)
                                from public.work_sessions s where s.organization_id = o.id and s.user_id = m.user_id and s.ended_at is null
                                order by s.started_at desc limit 1),
               'lost_7d', (select count(*) from public.work_sessions s where s.organization_id = o.id and s.user_id = m.user_id
                             and s.end_reason = 'agent_lost' and s.started_at > now() - interval '7 days'),
               'devices', coalesce((select jsonb_agg(jsonb_build_object('os', d.os, 'version', d.agent_version, 'last_seen_at', d.last_seen_at) order by d.last_seen_at desc nulls last)
                                    from public.devices d where d.organization_id = o.id and d.user_id = m.user_id and d.revoked_at is null), '[]'::jsonb),
               'push', exists (select 1 from public.push_subscriptions ps where ps.user_id = m.user_id))
             order by (m.role = 'owner') desc, m.joined_at)
      from public.memberships m join public.profiles pr on pr.id = m.user_id
      where m.organization_id = o.id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'created_at', i.created_at, 'expires_at', i.expires_at) order by i.created_at desc)
      from public.invitations i where i.organization_id = o.id and i.accepted_at is null and i.revoked_at is null), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('reference', p.reference, 'kind', p.kind, 'plan', p.plan, 'seats', p.seats, 'months', p.months,
               'amount_kobo', p.amount_kobo, 'status', p.status, 'failure_reason', p.failure_reason,
               'created_at', p.created_at, 'paid_at', p.paid_at, 'period_end', p.period_end) order by p.created_at desc)
      from public.payments p where p.organization_id = o.id), '[]'::jsonb),
    'meet_business', exists (select 1 from public.meet_subscriptions s where s.organization_id = o.id and s.status = 'success' and s.period_end > now()),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'author', n.author, 'body', n.body, 'created_at', n.created_at) order by n.created_at desc)
      from public.admin_notes n where n.organization_id = o.id), '[]'::jsonb),
    'support_views', coalesce((
      select jsonb_agg(jsonb_build_object('viewer', v.viewer, 'section', v.section, 'created_at', v.created_at) order by v.created_at desc)
      from (select * from public.support_views where organization_id = o.id order by created_at desc limit 20) v), '[]'::jsonb),
    'deep', v_deep
  );
end $$;

create or replace function public.admin_extend_trial(p_org uuid, p_until timestamptz, p_by text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  if p_until is null or p_until < now() or p_until > now() + interval '120 days' then
    raise exception 'Pick a date within the next 120 days' using errcode = '22023';
  end if;
  update public.organizations set trial_ends_at = p_until where id = p_org;
  if not found then raise exception 'Company not found' using errcode = 'P0002'; end if;
  perform private.log_audit(p_org, 'support.trial_extended', 'organization', p_org,
    jsonb_build_object('until', p_until, 'by', left(coalesce(p_by, 'support'), 200)));
  return p_until;
end $$;

create or replace function public.admin_add_note(p_org uuid, p_author text, p_body text)
returns bigint language sql security definer set search_path = '' as $$
  insert into public.admin_notes (organization_id, author, body)
  values (p_org, left(coalesce(p_author, 'support'), 200), trim(p_body))
  returning id
$$;

revoke execute on function private.lagos_day(timestamptz), private.admin_revenue() from public, anon, authenticated;
revoke execute on function public.admin_overview(integer), public.admin_companies(text, integer),
  public.admin_company(uuid, text, boolean), public.admin_extend_trial(uuid, timestamptz, text),
  public.admin_add_note(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_overview(integer), public.admin_companies(text, integer),
  public.admin_company(uuid, text, boolean), public.admin_extend_trial(uuid, timestamptz, text),
  public.admin_add_note(uuid, text, text) to service_role;
