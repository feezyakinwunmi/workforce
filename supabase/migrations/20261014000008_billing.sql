-- Billing: Free plan (up to 3 people), 14-day trial of Standard, prepaid Standard via Paystack.
--
-- How the plan is decided (no cron needed, always computed from facts):
--   * a successful payment whose period covers now  -> 'standard', seat limit = seats paid for
--   * otherwise, organizations.trial_ends_at > now() -> 'trial' (Standard features, no seat limit)
--   * otherwise                                     -> 'free', 3 seats, no window titles, 30 days of history
-- Seats go to active members in order: owner first, then by join date. Members beyond the
-- limit can still log in and see their data, but the desktop app will not clock them in.
--
-- Money: the browser never sets prices or marks anything paid. start_payment() (owner/admin)
-- prices the order in the database and records it as pending; confirm_payment() can only be
-- called by the server with the service-role key, after Paystack confirms the amount.
-- (organizations.plan is from Week 1 and is no longer used.)

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reference       text not null unique check (char_length(reference) between 8 and 100),
  kind            text not null check (kind in ('renew', 'add_seats', 'manual')),
  seats           integer not null check (seats between 1 and 10000),
  months          integer not null check (months in (0, 1, 3, 12)),  -- 0 for add_seats
  amount_kobo     bigint not null check (amount_kobo >= 0),
  currency        text not null default 'NGN' check (currency in ('NGN', 'USD')),
  status          text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  period_start    timestamptz,
  period_end      timestamptz,
  covers_until    timestamptz,       -- add_seats: end of the paid period the seats are added to
  channel         text,
  paystack_id     text,
  failure_reason  text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  check (status <> 'success' or (period_start is not null and period_end > period_start))
);

create index payments_org_status_idx on public.payments (organization_id, status, period_end);
create index payments_created_by_idx on public.payments (created_by);

-- Prices in kobo. Change here (and in apps/web/src/lib/billing.ts, which only displays them).
create or replace function private.seat_price_kobo()
returns bigint language sql immutable set search_path = '' as $$ select 250000::bigint $$; -- ₦2,500 per person per month

create or replace function private.free_seats()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- 12 months for the price of 10.
create or replace function private.billable_months(p_months integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_months when 12 then 10 else p_months end
$$;

-- The company's plan right now.
create or replace function private.org_billing(p_org uuid)
returns table (tier text, seat_limit integer, paid_seats integer, paid_until timestamptz,
               trial_ends_at timestamptz, active_members integer)
language sql stable security definer set search_path = '' as $$
  select
    case when coalesce(cur.seats, 0) > 0 then 'standard'
         when o.trial_ends_at > now() then 'trial'
         else 'free' end,
    case when coalesce(cur.seats, 0) > 0 then cur.seats
         when o.trial_ends_at > now() then null
         else private.free_seats() end,
    coalesce(cur.seats, 0),
    (select max(p.period_end) from public.payments p
      where p.organization_id = o.id and p.status = 'success' and p.period_end > now()),
    o.trial_ends_at,
    (select count(*)::int from public.memberships m where m.organization_id = o.id and m.status = 'active')
  from public.organizations o
  left join lateral (
    select sum(p.seats)::int as seats
    from public.payments p
    where p.organization_id = o.id and p.status = 'success'
      and p.period_start <= now() and p.period_end > now()
  ) cur on true
  where o.id = p_org;
$$;

-- Is this member inside the plan's seat limit?
create or replace function private.member_can_track(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with lim as (select b.seat_limit from private.org_billing(p_org) b),
  ranked as (
    select m.user_id,
           row_number() over (order by (m.role = 'owner') desc, m.joined_at, m.id) as rn
    from public.memberships m
    where m.organization_id = p_org and m.status = 'active'
  )
  select case
    when (select seat_limit from lim) is null then exists (select 1 from ranked where user_id = p_user)
    else coalesce((select rn <= (select seat_limit from lim) from ranked where user_id = p_user), false)
  end;
$$;

-- What the desktop app needs: may this person clock in, and are window titles allowed?
create or replace function private.agent_billing(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', b.tier,
    'can_track', private.member_can_track(p_org, p_user),
    'message', case when not private.member_can_track(p_org, p_user) then
      case b.tier
        when 'free' then 'Your company''s free plan covers ' || private.free_seats() || ' people. Ask your company admin to upgrade so you can clock in.'
        else 'Your company has paid for ' || b.seat_limit || ' people. Ask your company admin to add a seat for you so you can clock in.'
      end end)
  from private.org_billing(p_org) b;
$$;

-- Dashboard: the caller's company plan.
create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  b     record;
begin
  if v_org is null then
    raise exception 'Your account is not active in any company' using errcode = '42501';
  end if;
  select * into b from private.org_billing(v_org);
  return jsonb_build_object(
    'tier', b.tier,
    'seat_limit', b.seat_limit,
    'paid_seats', b.paid_seats,
    'paid_until', b.paid_until,
    'trial_ends_at', b.trial_ends_at,
    'active_members', b.active_members,
    'can_track', private.member_can_track(v_org, auth.uid()),
    'tracked_member_ids', (
      select coalesce(jsonb_agg(m.user_id), '[]'::jsonb) from public.memberships m
      where m.organization_id = v_org and m.status = 'active' and private.member_can_track(v_org, m.user_id)),
    'seat_price_kobo', private.seat_price_kobo(),
    'free_seats', private.free_seats()
  );
end $$;

-- Owner/admin starts a payment. The database sets the price.
--   renew:     p_seats people for p_months (1, 3 or 12); starts when the current paid period ends
--   add_seats: p_seats extra people until the current paid period ends (charged per day left)
create or replace function public.start_payment(p_kind text, p_seats integer, p_months integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid := private.current_org_id();
  b        record;
  v_amount bigint;
  v_until  timestamptz;
  v_days   integer;
  v_email  text;
  v_ref    text := 'wf_' || replace(gen_random_uuid()::text, '-', '');
begin
  if v_org is null or not private.is_org_admin() then
    raise exception 'Only the company owner or an admin can pay' using errcode = '42501';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 10000 then
    raise exception 'Choose between 1 and 10,000 people' using errcode = '22023';
  end if;
  select * into b from private.org_billing(v_org);

  if p_kind = 'renew' then
    if p_months not in (1, 3, 12) then
      raise exception 'Choose 1, 3 or 12 months' using errcode = '22023';
    end if;
    if p_seats < b.active_members then
      raise exception 'You have % active people. Pay for at least that many, or suspend people you no longer need.', b.active_members
        using errcode = '22023';
    end if;
    v_amount := p_seats * private.seat_price_kobo() * private.billable_months(p_months);
  elsif p_kind = 'add_seats' then
    if b.tier <> 'standard' then
      raise exception 'Adding people is for companies with a paid plan. Choose a plan first.' using errcode = '22023';
    end if;
    v_until := b.paid_until;
    v_days := greatest(1, ceil(extract(epoch from (v_until - now())) / 86400)::int);
    -- Monthly price per day left, rounded up to whole naira.
    v_amount := ceil(p_seats * private.seat_price_kobo() * v_days / 30.0 / 100.0)::bigint * 100;
    p_months := 0;
  else
    raise exception 'Unknown payment type' using errcode = '22023';
  end if;

  select p.email into v_email from public.profiles p where p.id = auth.uid();

  insert into public.payments (organization_id, reference, kind, seats, months, amount_kobo, covers_until)
  values (v_org, v_ref, p_kind, p_seats, p_months, v_amount, v_until);

  return jsonb_build_object('reference', v_ref, 'amount_kobo', v_amount, 'currency', 'NGN',
                            'email', v_email, 'kind', p_kind, 'seats', p_seats, 'months', p_months);
end $$;

-- Server only (service-role key), after Paystack says the payment succeeded.
-- Safe to call twice (the callback page and the webhook both call it).
create or replace function public.confirm_payment(
  p_reference text, p_amount_kobo bigint, p_currency text,
  p_paystack_id text default null, p_channel text default null, p_paid_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pay     public.payments;
  v_start timestamptz;
  v_end   timestamptz;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown reference');
  end if;
  if pay.status = 'success' then
    return jsonb_build_object('ok', true, 'already', true, 'organization_id', pay.organization_id);
  end if;
  if p_amount_kobo is distinct from pay.amount_kobo or upper(coalesce(p_currency, '')) <> pay.currency then
    update public.payments set status = 'failed', failure_reason = 'amount or currency mismatch',
      paystack_id = p_paystack_id where id = pay.id;
    return jsonb_build_object('ok', false, 'error', 'amount mismatch');
  end if;

  if pay.kind = 'add_seats' then
    v_start := now();
    v_end := pay.covers_until;
    if v_end is null or v_end <= now() then
      v_end := now() + (coalesce(pay.covers_until, pay.created_at + interval '30 days') - pay.created_at);
    end if;
  else
    -- Renewal starts when the current paid period ends (or now, if nothing is paid).
    select greatest(now(), coalesce(max(p.period_end), now())) into v_start
    from public.payments p
    where p.organization_id = pay.organization_id and p.status = 'success' and p.kind <> 'add_seats';
    v_end := v_start + make_interval(months => pay.months);
  end if;

  update public.payments
  set status = 'success', period_start = v_start, period_end = v_end,
      paid_at = coalesce(p_paid_at, now()), channel = left(p_channel, 40), paystack_id = left(p_paystack_id, 60)
  where id = pay.id;

  perform private.log_audit(pay.organization_id, 'billing.payment_succeeded', 'payment', pay.id,
    jsonb_build_object('kind', pay.kind, 'seats', pay.seats, 'months', pay.months,
                       'amount_kobo', pay.amount_kobo, 'period_end', v_end));
  return jsonb_build_object('ok', true, 'organization_id', pay.organization_id, 'period_end', v_end);
end $$;

-- Forget payment attempts that were never completed.
select cron.schedule('forget-unpaid-payments', '35 3 * * *',
  $$delete from public.payments where status = 'pending' and created_at < now() - interval '7 days'$$);

-- ---------------------------------------------------------------------
-- Desktop app: login and heartbeat now also return the plan
-- (billing.can_track, and settings.track_window_titles = false on Free).
-- ---------------------------------------------------------------------
create or replace function public.register_device(
  p_install_id text, p_name text, p_os text, p_agent_version text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me  record;
  dev public.devices;
  v_name text;
  v_billing jsonb;
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
  v_billing := private.agent_billing(me.organization_id, uid);

  return jsonb_build_object(
    'device_id',         dev.id,
    'organization_id',   me.organization_id,
    'organization_name', me.org_name,
    'role',              me.role,
    'timezone',          me.timezone,
    'full_name',         coalesce(v_name, ''),
    'settings',          me.settings || jsonb_build_object('track_window_titles', v_billing ->> 'tier' <> 'free'),
    'billing',           v_billing,
    'server_time',       now()
  );
end $$;

create or replace function public.heartbeat(
  p_device_id uuid, p_session_id uuid default null,
  p_state text default null, p_current_app text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me  record;
  dev public.devices;
  v_billing jsonb;
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

  v_billing := private.agent_billing(me.organization_id, uid);
  return jsonb_build_object(
    'active', true,
    'settings', me.settings || jsonb_build_object('track_window_titles', v_billing ->> 'tier' <> 'free'),
    'billing', v_billing,
    'server_time', now());
end $$;

-- ---------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------
alter table public.payments enable row level security;

create policy "admins read their company's payments" on public.payments
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

revoke execute on function private.org_billing(uuid)            from public, anon, authenticated;
revoke execute on function private.member_can_track(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.agent_billing(uuid, uuid)    from public, anon, authenticated;

revoke execute on function public.my_billing()                          from public, anon;
revoke execute on function public.start_payment(text, integer, integer) from public, anon;
grant execute on function public.my_billing()                          to authenticated;
grant execute on function public.start_payment(text, integer, integer) to authenticated;

revoke execute on function public.confirm_payment(text, bigint, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_payment(text, bigint, text, text, text, timestamptz) to service_role;
