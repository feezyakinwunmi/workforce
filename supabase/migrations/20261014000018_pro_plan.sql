-- Pro plan: everything in Standard plus optional screenshots.
--
-- Prices (per person per month, in kobo) live here: Standard ₦2,500, Pro ₦4,000.
-- A payment now records which plan it buys. A company is on Pro while a successful Pro
-- payment covers today. Standard companies can upgrade for the rest of their paid period
-- (kind 'upgrade': pays the difference for the people already paid for, adds no seats).

alter table public.payments
  add column plan text not null default 'standard' check (plan in ('standard', 'pro'));
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check
  check (kind in ('renew', 'add_seats', 'upgrade', 'manual'));

create or replace function private.plan_price_kobo(p_plan text)
returns bigint language sql immutable set search_path = '' as $$
  select case p_plan when 'pro' then 400000::bigint else 250000::bigint end   -- ₦4,000 / ₦2,500
$$;
revoke execute on function private.plan_price_kobo(text) from public, anon, authenticated;

-- Same columns as before; tier can now also be 'pro'.
create or replace function private.org_billing(p_org uuid)
returns table (tier text, seat_limit integer, paid_seats integer, paid_until timestamptz,
               trial_ends_at timestamptz, active_members integer)
language sql stable security definer set search_path = '' as $$
  select
    case when coalesce(cur.seats, 0) > 0 then (case when cur.pro then 'pro' else 'standard' end)
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
    select sum(p.seats) filter (where p.kind <> 'upgrade')::int as seats,
           coalesce(bool_or(p.plan = 'pro'), false) as pro
    from public.payments p
    where p.organization_id = o.id and p.status = 'success'
      and p.period_start <= now() and p.period_end > now()
  ) cur on true
  where o.id = p_org;
$$;

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
    'seat_price_kobo', private.plan_price_kobo('standard'),
    'pro_price_kobo', private.plan_price_kobo('pro'),
    'free_seats', private.free_seats()
  );
end $$;

-- Price an order (the browser never sets a price). p_plan: 'standard' or 'pro'.
create or replace function public.start_payment(p_kind text, p_seats integer, p_months integer, p_plan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid := private.current_org_id();
  b        record;
  v_amount bigint;
  v_until  timestamptz;
  v_days   integer;
  v_email  text;
  v_plan   text := coalesce(p_plan, 'standard');
  v_ref    text := 'wf_' || replace(gen_random_uuid()::text, '-', '');
begin
  if v_org is null or not private.is_org_admin() then
    raise exception 'Only the company owner or an admin can pay' using errcode = '42501';
  end if;
  if v_plan not in ('standard', 'pro') then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;
  select * into b from private.org_billing(v_org);

  if p_kind = 'renew' then
    if p_seats is null or p_seats < 1 or p_seats > 10000 then
      raise exception 'Choose between 1 and 10,000 people' using errcode = '22023';
    end if;
    if p_months not in (1, 3, 12) then
      raise exception 'Choose 1, 3 or 12 months' using errcode = '22023';
    end if;
    if p_seats < b.active_members then
      raise exception 'You have % active people. Pay for at least that many, or suspend people you no longer need.', b.active_members
        using errcode = '22023';
    end if;
    v_amount := p_seats * private.plan_price_kobo(v_plan) * private.billable_months(p_months);

  elsif p_kind = 'add_seats' then
    if p_seats is null or p_seats < 1 or p_seats > 10000 then
      raise exception 'Choose between 1 and 10,000 people' using errcode = '22023';
    end if;
    if b.tier not in ('standard', 'pro') then
      raise exception 'Adding people is for companies with a paid plan. Choose a plan first.' using errcode = '22023';
    end if;
    v_plan := b.tier;                     -- extra people join the plan you are on
    v_until := b.paid_until;
    v_days := greatest(1, ceil(extract(epoch from (v_until - now())) / 86400)::int);
    v_amount := ceil(p_seats * private.plan_price_kobo(v_plan) * v_days / 30.0 / 100.0)::bigint * 100;
    p_months := 0;

  elsif p_kind = 'upgrade' then
    if b.tier <> 'standard' then
      raise exception 'Upgrading is for companies on a paid Standard plan.' using errcode = '22023';
    end if;
    v_plan := 'pro';
    p_seats := b.paid_seats;              -- the people already paid for
    v_until := b.paid_until;
    v_days := greatest(1, ceil(extract(epoch from (v_until - now())) / 86400)::int);
    v_amount := ceil(p_seats * (private.plan_price_kobo('pro') - private.plan_price_kobo('standard'))
                     * v_days / 30.0 / 100.0)::bigint * 100;
    p_months := 0;

  else
    raise exception 'Unknown payment type' using errcode = '22023';
  end if;

  select p.email into v_email from public.profiles p where p.id = auth.uid();

  insert into public.payments (organization_id, reference, kind, plan, seats, months, amount_kobo, covers_until)
  values (v_org, v_ref, p_kind, v_plan, p_seats, p_months, v_amount, v_until);

  return jsonb_build_object('reference', v_ref, 'amount_kobo', v_amount, 'currency', 'NGN', 'email', v_email,
                            'kind', p_kind, 'plan', v_plan, 'seats', p_seats, 'months', p_months);
end $$;

-- Older dashboards call the 3-argument version: Standard.
create or replace function public.start_payment(p_kind text, p_seats integer, p_months integer default 1)
returns jsonb language sql security definer set search_path = '' as $$
  select public.start_payment(p_kind, p_seats, p_months, 'standard'::text);
$$;

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

  if pay.kind in ('add_seats', 'upgrade') then
    -- Runs from now to the end of the period it was priced for.
    v_start := now();
    v_end := pay.covers_until;
    if v_end is null or v_end <= now() then
      v_end := now() + (coalesce(pay.covers_until, pay.created_at + interval '30 days') - pay.created_at);
    end if;
  else
    select greatest(now(), coalesce(max(p.period_end), now())) into v_start
    from public.payments p
    where p.organization_id = pay.organization_id and p.status = 'success' and p.kind not in ('add_seats', 'upgrade');
    v_end := v_start + make_interval(months => pay.months);
  end if;

  update public.payments
  set status = 'success', period_start = v_start, period_end = v_end,
      paid_at = coalesce(p_paid_at, now()), channel = left(p_channel, 40), paystack_id = left(p_paystack_id, 60)
  where id = pay.id;

  perform private.log_audit(pay.organization_id, 'billing.payment_succeeded', 'payment', pay.id,
    jsonb_build_object('kind', pay.kind, 'plan', pay.plan, 'seats', pay.seats, 'months', pay.months,
                       'amount_kobo', pay.amount_kobo, 'period_end', v_end));
  return jsonb_build_object('ok', true, 'organization_id', pay.organization_id, 'period_end', v_end);
end $$;

-- Plan reminders also for Pro.
create or replace function private.billing_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
  k integer;
begin
  with plan as (
    select o.id as org, b.tier,
           case when b.tier in ('standard', 'pro') then b.paid_until when b.tier = 'trial' then b.trial_ends_at end as ends_at
    from public.organizations o
    cross join lateral private.org_billing(o.id) b
  ),
  due as (
    select p.org, p.tier, p.ends_at,
           ceil(extract(epoch from (p.ends_at - now())) / 86400)::int as days_left
    from plan p
    where p.ends_at is not null and p.ends_at > now()
  )
  insert into public.notifications (organization_id, user_id, kind, title, body, link, ref_date)
  select d.org, m.user_id, 'billing',
         case when d.tier = 'trial'
              then 'Your free trial ends ' || case when d.days_left = 1 then 'tomorrow' else 'in ' || d.days_left || ' days' end
              else 'Your plan ends ' || case when d.days_left = 1 then 'tomorrow' else 'in ' || d.days_left || ' days' end end,
         case when d.tier = 'trial'
              then 'After that your company moves to the Free plan (up to ' || private.free_seats() || ' people). Choose Standard to keep every feature.'
              else 'Renew to keep everyone tracking. People not covered by a plan can''t clock in.' end,
         '/dashboard/billing', d.ends_at::date
  from due d
  join public.memberships m on m.organization_id = d.org and m.status = 'active' and m.role in ('owner', 'admin')
  where d.days_left in (7, 1)
  on conflict (user_id, ref_date, title) where kind = 'billing' do nothing;
  get diagnostics k = row_count;
  n := n + k;
  return n;
end $$;

revoke execute on function public.start_payment(text, integer, integer, text) from public, anon;
grant execute on function public.start_payment(text, integer, integer, text) to authenticated;
