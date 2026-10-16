-- Owner console tabs: one report per product (Workbase, Meet, Book), plus Money and Accounts.
-- All service-role only, like 0038. Customer content stays out: no meeting titles, no booking
-- customers' names or emails, no chats, notes, screenshots or pay.

create or replace function public.admin_workbase(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date := private.lagos_day(now()) - (v_days - 1);
  v_since timestamptz := (v_from::timestamp at time zone 'Africa/Lagos');
  v_week timestamptz := now() - interval '7 days';
  v_month timestamptz := now() - interval '30 days';
begin
  return jsonb_build_object(
    'days', v_days,
    'plans', (
      select jsonb_build_object(
        'free', count(*) filter (where b.tier = 'free'),
        'trial', count(*) filter (where b.tier = 'trial'),
        'standard', count(*) filter (where b.tier = 'standard'),
        'pro', count(*) filter (where b.tier = 'pro'),
        'paid_seats', coalesce(sum(b.paid_seats) filter (where b.tier in ('standard', 'pro')), 0),
        'monthly_value_kobo', coalesce(sum(b.paid_seats::bigint * private.plan_price_kobo(b.tier)) filter (where b.tier in ('standard', 'pro')), 0),
        'closing', count(*) filter (where o.closing_at is not null))
      from public.organizations o cross join lateral private.org_billing(o.id) b
    ),
    'people', jsonb_build_object(
      'members', (select count(*) from public.memberships m where m.status = 'active'),
      'tracking_7d', (select count(distinct s.user_id) from public.work_sessions s where s.started_at > v_week),
      'working_now', (select count(*) from public.work_sessions s where s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes'),
      'not_reporting', (select count(*) from public.work_sessions s where s.ended_at is null and s.source = 'desktop'
                          and (s.last_heartbeat_at is null or s.last_heartbeat_at <= now() - interval '3 minutes')),
      'desktop_sessions', (select count(*) from public.work_sessions s where s.started_at >= v_since and s.source = 'desktop'),
      'phone_sessions', (select count(*) from public.work_sessions s where s.started_at >= v_since and s.source = 'phone'),
      'lost_sessions', (select count(*) from public.work_sessions s where s.started_at >= v_since and s.end_reason = 'agent_lost'),
      'pending_invites', (select count(*) from public.invitations i where i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'new_companies', (select count(*) from public.organizations o where private.lagos_day(o.created_at) = g.day),
        'active_companies', (select count(distinct s.organization_id) from public.work_sessions s
                              where s.started_at >= (g.day::timestamp at time zone 'Africa/Lagos') and s.started_at < ((g.day + 1)::timestamp at time zone 'Africa/Lagos')),
        'people', (select count(distinct s.user_id) from public.work_sessions s
                    where s.started_at >= (g.day::timestamp at time zone 'Africa/Lagos') and s.started_at < ((g.day + 1)::timestamp at time zone 'Africa/Lagos')),
        'hours', (select coalesce(round(sum(a.active_seconds + a.idle_seconds + coalesce(a.field_seconds, 0)) / 3600.0, 1), 0) from public.activity_blocks a
                   where a.block_start >= (g.day::timestamp at time zone 'Africa/Lagos') and a.block_start < ((g.day + 1)::timestamp at time zone 'Africa/Lagos'))
      ) order by g.day)
      from (select generate_series(v_from, private.lagos_day(now()), interval '1 day')::date as day) g
    ),
    -- How many companies used each part of Workbase in the last 30 days.
    'features', jsonb_build_object(
      'clock_in', (select count(distinct organization_id) from public.work_sessions where started_at > v_month),
      'phone_clock_in', (select count(distinct organization_id) from public.work_sessions where started_at > v_month and source = 'phone'),
      'tasks', (select count(distinct organization_id) from public.tasks where created_at > v_month),
      'chat', (select count(distinct organization_id) from public.messages where created_at > v_month),
      'leave', (select count(distinct organization_id) from public.leave_requests where created_at > v_month),
      'payslips', (select count(distinct organization_id) from public.payslips where issued_at > v_month),
      'expenses', (select count(distinct organization_id) from public.expense_claims where created_at > v_month),
      'reviews', (select count(distinct organization_id) from public.reviews where created_at > v_month),
      'screenshots_on', (select count(*) from public.organizations o where coalesce((o.settings ->> 'screenshots_enabled')::boolean, false)),
      'clock_reminders', (select count(*) from public.organizations o where o.settings ? 'work_start' and coalesce((o.settings ->> 'clock_reminders')::boolean, true))
    ),
    'top_companies', coalesce((
      select jsonb_agg(t order by t.hours_7d desc, t.people_7d desc) from (
        select o.id, o.name, b.tier, b.active_members as members,
               (select count(distinct s.user_id) from public.work_sessions s where s.organization_id = o.id and s.started_at > v_week) as people_7d,
               (select coalesce(round(sum(a.active_seconds + a.idle_seconds + coalesce(a.field_seconds, 0)) / 3600.0, 1), 0)
                  from public.activity_blocks a where a.organization_id = o.id and a.block_start > v_week) as hours_7d
        from public.organizations o cross join lateral private.org_billing(o.id) b
        where o.closing_at is null
        order by 6 desc, 5 desc limit 15
      ) t where t.people_7d > 0), '[]'::jsonb),
    'quiet_companies', coalesce((
      select jsonb_agg(q order by q.created_at desc) from (
        select o.id, o.name, o.created_at, b.tier, b.active_members as members,
               (select count(*) from public.invitations i where i.organization_id = o.id and i.accepted_at is null and i.revoked_at is null) as invited,
               (select max(s.started_at) from public.work_sessions s where s.organization_id = o.id) as last_clock_in
        from public.organizations o cross join lateral private.org_billing(o.id) b
        where o.closing_at is null
          and not exists (select 1 from public.work_sessions s where s.organization_id = o.id and s.started_at > v_week)
        order by o.created_at desc limit 20
      ) q), '[]'::jsonb),
    'funnel', jsonb_build_object(
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
    'app_versions', coalesce((
      select jsonb_agg(jsonb_build_object('version', v.agent_version, 'devices', v.n) order by v.n desc)
      from (select coalesce(nullif(d.agent_version, ''), 'unknown') as agent_version, count(*) as n
            from public.devices d where d.revoked_at is null and d.last_seen_at > now() - interval '14 days' group by 1) v
    ), '[]'::jsonb),
    'os', coalesce((
      select jsonb_agg(jsonb_build_object('os', v.os, 'devices', v.n) order by v.n desc)
      from (select coalesce(nullif(split_part(d.os, ' ', 1), ''), 'unknown') as os, count(*) as n
            from public.devices d where d.revoked_at is null and d.last_seen_at > now() - interval '14 days' group by 1) v
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_meet(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date := private.lagos_day(now()) - (v_days - 1);
begin
  return jsonb_build_object(
    'days', v_days,
    'totals', (
      select jsonb_build_object(
        'meetings', coalesce(sum(d.meetings), 0), 'minutes', coalesce(sum(d.minutes), 0),
        'people', coalesce(sum(d.people), 0), 'guests', coalesce(sum(d.guests), 0))
      from public.admin_meet_daily d where d.day >= v_from
    ),
    'live', coalesce((
      select jsonb_agg(jsonb_build_object(
               'host', coalesce(nullif(pr.full_name, ''), pr.email, 'Host'), 'started_at', r.started_at, 'ends_at', r.ends_at,
               'people', private.meet_live_count(r.id),
               'guests', (select count(*) from public.meet_participants p join public.meet_presence s on s.participant_id = p.id
                          where p.room_id = r.id and p.status = 'admitted' and p.is_guest and s.last_seen_at > now() - interval '45 seconds'),
               'tier', private.meet_tier(r.host_id))
             order by r.started_at)
      from public.meet_rooms r left join public.profiles pr on pr.id = r.host_id
      where r.started_at is not null and r.ended_at is null), '[]'::jsonb),
    'upcoming', (select count(*) from public.meet_rooms r where r.started_at is null and r.starts_at > now()),
    'hosts_7d', (select count(distinct r.host_id) from public.meet_rooms r where r.started_at > now() - interval '7 days'),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', g.day,
               'meetings', coalesce(d.meetings, 0), 'minutes', coalesce(d.minutes, 0),
               'people', coalesce(d.people, 0), 'guests', coalesce(d.guests, 0)) order by g.day)
      from (select generate_series(v_from, private.lagos_day(now()), interval '1 day')::date as day) g
      left join public.admin_meet_daily d on d.day = g.day
    ),
    -- Meetings kept (last 7 days): no titles or codes, just who hosted and how it went.
    'recent', coalesce((
      select jsonb_agg(x order by x.started_at desc) from (
        select coalesce(nullif(pr.full_name, ''), pr.email, 'Host') as host, r.started_at, r.ended_at,
               greatest(0, round(extract(epoch from coalesce(r.ended_at, now()) - r.started_at) / 60))::int as minutes,
               (select count(*) from public.meet_participants p where p.room_id = r.id and p.first_joined_at is not null) as people,
               (select count(*) from public.meet_participants p where p.room_id = r.id and p.first_joined_at is not null and p.is_guest) as guests,
               r.starts_at is not null as scheduled, private.meet_tier(r.host_id) as tier
        from public.meet_rooms r left join public.profiles pr on pr.id = r.host_id
        where r.started_at is not null order by r.started_at desc limit 30) x), '[]'::jsonb),
    'subscribers', coalesce((
      select jsonb_agg(x order by x.period_end desc) from (
        select s.plan, coalesce(nullif(pr.full_name, ''), pr.email) as who, pr.email, o.name as company, o.id as organization_id,
               s.period_end, s.amount_kobo, s.months
        from public.meet_subscriptions s
        left join public.profiles pr on pr.id = s.user_id
        left join public.organizations o on o.id = s.organization_id
        where s.status = 'success' and s.period_end > now()) x), '[]'::jsonb),
    'revenue', (select jsonb_build_object(
                  'all_time', coalesce(sum(s.amount_kobo), 0),
                  'last_30_days', coalesce(sum(s.amount_kobo) filter (where coalesce(s.period_start, s.created_at) > now() - interval '30 days'), 0))
                from public.meet_subscriptions s where s.status = 'success'),
    'workbase_included', (select count(*) from public.organizations o cross join lateral private.org_billing(o.id) b where b.tier in ('standard', 'pro'))
  );
end $$;

create or replace function public.admin_book(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date := private.lagos_day(now()) - (v_days - 1);
  v_since timestamptz := (v_from::timestamp at time zone 'Africa/Lagos');
begin
  return jsonb_build_object(
    'days', v_days,
    'pages', (select jsonb_build_object(
                'total', count(*), 'live', count(*) filter (where p.active),
                'payouts', count(*) filter (where p.subaccount_code is not null),
                'pro', count(*) filter (where private.book_tier(p.owner_id) = 'pro'),
                'services', (select count(*) from public.book_services s where s.active))
              from public.book_pages p),
    'bookings', (select jsonb_build_object(
                   'made', count(*) filter (where b.status <> 'pending_payment' or b.paid_at is not null),
                   'confirmed', count(*) filter (where b.status = 'confirmed'),
                   'completed', count(*) filter (where b.status = 'completed'),
                   'no_show', count(*) filter (where b.status = 'no_show'),
                   'cancelled_customer', count(*) filter (where b.status = 'cancelled' and b.cancelled_by = 'customer'),
                   'cancelled_host', count(*) filter (where b.status = 'cancelled' and b.cancelled_by = 'host'),
                   'unpaid_released', count(*) filter (where b.status = 'cancelled' and b.cancelled_by = 'system' and b.paid_at is null),
                   'waiting_payment', count(*) filter (where b.status = 'pending_payment' and b.hold_until > now()),
                   'paid', count(*) filter (where b.paid_at is not null),
                   'video', count(*) filter (where b.location = 'meet'),
                   'upcoming', (select count(*) from public.book_bookings u where u.status = 'confirmed' and u.starts_at > now()))
                 from public.book_bookings b where b.created_at >= v_since),
    'money', (select jsonb_build_object(
                'customers_paid_kobo', coalesce(sum(b.pay_now_kobo) filter (where b.paid_at >= v_since), 0),
                'fees_kobo', coalesce(sum(b.fee_kobo) filter (where b.paid_at >= v_since), 0),
                'fees_all_time_kobo', coalesce(sum(b.fee_kobo) filter (where b.paid_at is not null), 0),
                'pro_kobo', (select coalesce(sum(s.amount_kobo), 0) from public.book_subscriptions s
                             where s.status = 'success' and coalesce(s.period_start, s.created_at) >= v_since))
              from public.book_bookings b),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'bookings', (select count(*) from public.book_bookings b where (b.status <> 'pending_payment' or b.paid_at is not null) and private.lagos_day(b.created_at) = g.day),
        'paid_kobo', (select coalesce(sum(b.pay_now_kobo), 0) from public.book_bookings b where b.paid_at is not null and private.lagos_day(b.paid_at) = g.day),
        'fees_kobo', (select coalesce(sum(b.fee_kobo), 0) from public.book_bookings b where b.paid_at is not null and private.lagos_day(b.paid_at) = g.day)
      ) order by g.day)
      from (select generate_series(v_from, private.lagos_day(now()), interval '1 day')::date as day) g
    ),
    -- Every booking page, busiest first. Customers' names and emails are never included.
    'page_list', coalesce((
      select jsonb_agg(x order by x.bookings_period desc, x.created_at desc) from (
        select p.id, p.handle, p.name, p.active, p.created_at, pr.email as owner_email,
               coalesce(nullif(pr.full_name, ''), pr.email) as owner,
               private.book_tier(p.owner_id) as tier, p.subaccount_code is not null as payouts, p.bank_name,
               (select count(*) from public.book_services s where s.page_id = p.id and s.active) as services,
               (select count(*) from public.book_bookings b where b.page_id = p.id and b.created_at >= v_since
                  and (b.status <> 'pending_payment' or b.paid_at is not null)) as bookings_period,
               (select coalesce(sum(b.pay_now_kobo), 0) from public.book_bookings b where b.page_id = p.id and b.paid_at >= v_since) as paid_period_kobo,
               (select max(b.created_at) from public.book_bookings b where b.page_id = p.id) as last_booking
        from public.book_pages p left join public.profiles pr on pr.id = p.owner_id
        limit 200) x), '[]'::jsonb)
  );
end $$;

-- Everyone with an account (guests left out). p_filter: '' all, 'no_company', 'unconfirmed'.
create or replace function public.admin_accounts(p_q text default '', p_filter text default '', p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
                 'accounts', count(*),
                 'confirmed', count(*) filter (where u.email_confirmed_at is not null),
                 'in_company', count(*) filter (where exists (select 1 from public.memberships m where m.user_id = u.id and m.status = 'active')),
                 'active_7d', count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
                 'new_7d', count(*) filter (where u.created_at > now() - interval '7 days'))
               from auth.users u where not coalesce(u.is_anonymous, false)),
    'rows', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select u.id, u.email, coalesce(nullif(pr.full_name, ''), '') as name, u.created_at, u.last_sign_in_at,
               u.email_confirmed_at is not null as confirmed,
               coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
               m.role as company_role, o.id as organization_id, o.name as company,
               (select count(*) from public.meet_rooms r where r.host_id = u.id) as meetings_7d,
               private.meet_tier(u.id) as meet_tier,
               (select bp.handle from public.book_pages bp where bp.owner_id = u.id) as book_handle
        from auth.users u
        left join public.profiles pr on pr.id = u.id
        left join public.memberships m on m.user_id = u.id and m.status = 'active'
        left join public.organizations o on o.id = m.organization_id
        where not coalesce(u.is_anonymous, false)
          and (coalesce(trim(p_q), '') = '' or u.email ilike '%' || trim(p_q) || '%' or pr.full_name ilike '%' || trim(p_q) || '%')
          and (coalesce(p_filter, '') = ''
               or (p_filter = 'no_company' and m.user_id is null)
               or (p_filter = 'unconfirmed' and u.email_confirmed_at is null))
        order by u.created_at desc
        limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb)
  )
$$;

-- Money: month by month per product, and every payment (failed and started ones too).
create or replace function public.admin_money(p_months integer default 12, p_product text default '', p_status text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_months integer := least(greatest(coalesce(p_months, 12), 1), 36);
  v_start date := (date_trunc('month', now() at time zone 'Africa/Lagos') - make_interval(months => v_months - 1))::date;
begin
  return jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
               'by_product', coalesce((select jsonb_object_agg(r.product, r.total) from (
                  select v.product, sum(v.amount_kobo) as total from private.admin_revenue() v
                  where date_trunc('month', v.paid_at at time zone 'Africa/Lagos') = g.m group by v.product) r), '{}'::jsonb))
             order by g.m)
      from (select generate_series(v_start::timestamp, date_trunc('month', now() at time zone 'Africa/Lagos'), interval '1 month') as m) g
    ),
    'payments', coalesce((
      select jsonb_agg(x order by x.at desc) from (
        select * from (
          select 'workbase_' || p.plan as product, p.status, p.amount_kobo, coalesce(p.paid_at, p.created_at) as at, p.reference,
                 o.name as who, o.id as organization_id, p.failure_reason,
                 p.kind || ' · ' || p.seats || ' people' || case when p.months > 0 then ' · ' || p.months || ' mo' else '' end as detail
            from public.payments p join public.organizations o on o.id = p.organization_id
          union all
          select 'meet_' || s.plan, s.status, s.amount_kobo::bigint, s.created_at, s.reference,
                 coalesce(o.name, nullif(pr.full_name, ''), pr.email), s.organization_id, null, s.months || ' mo'
            from public.meet_subscriptions s left join public.profiles pr on pr.id = s.user_id left join public.organizations o on o.id = s.organization_id
          union all
          select 'book_pro', s.status, s.amount_kobo::bigint, s.created_at, s.reference,
                 coalesce(nullif(pr.full_name, ''), pr.email), null, null, s.months || ' mo'
            from public.book_subscriptions s left join public.profiles pr on pr.id = s.user_id
          union all
          select 'book_fees', 'success', b.fee_kobo::bigint, b.paid_at, b.pay_reference,
                 '@' || pg.handle, null, null, 'fee on ' || to_char(b.pay_now_kobo / 100.0, 'FM999,999,990') || ' paid'
            from public.book_bookings b join public.book_pages pg on pg.id = b.page_id
            where b.paid_at is not null and b.fee_kobo > 0
        ) a
        where (coalesce(p_product, '') = '' or a.product like p_product || '%')
          and (coalesce(p_status, '') = '' or a.status = p_status)
        order by a.at desc limit 300) x), '[]'::jsonb)
  );
end $$;

revoke execute on function public.admin_workbase(integer), public.admin_meet(integer), public.admin_book(integer),
  public.admin_accounts(text, text, integer), public.admin_money(integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_workbase(integer), public.admin_meet(integer), public.admin_book(integer),
  public.admin_accounts(text, text, integer), public.admin_money(integer, text, text) to service_role;
