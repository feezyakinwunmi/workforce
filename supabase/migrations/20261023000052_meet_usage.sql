-- Workbase Meet: prices that cover what calls cost us, with a monthly allowance of meeting time.
--
-- What costs money is video sent out to each person, so time is counted in "person-hours":
-- people in the meeting × hours (guests included). Each host draws from a pool:
--   * Free host:                  15 person-hours a month (pool = the person)
--   * Meet Pro (₦4,000/month):    60 person-hours a month (pool = the person)
--   * Meet Business (₦30,000):    400 person-hours a month shared by the company's first 10 hosts
--   * Workbase Standard/Pro:      5 person-hours per paid person (at least 20), shared by the company
-- (Business and Workbase add up for a company that has both.) Top-ups: ₦1,000 = 15 more
-- person-hours, kept for 12 months, used only after the month's allowance.
--
-- When the pool is empty, new meetings start with cameras off (sound and screen sharing still
-- work). A meeting already running is never cut. Paying (plan or top-up) turns cameras back on in
-- that pool's live meetings at once. People only ever see percentages and hours, never our costs.

-- ---------------------------------------------------------------------------
-- Prices (kobo). 12 months of a plan cost 10.
-- ---------------------------------------------------------------------------
create or replace function private.meet_price_kobo(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'pro' then 400000 when 'business' then 3000000 when 'topup' then 100000 end
$$;

create or replace function private.meet_month()
returns date language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'Africa/Lagos')::date
$$;

-- ---------------------------------------------------------------------------
-- Tables (no direct access: read through the functions below)
-- ---------------------------------------------------------------------------
create table public.meet_usage (
  pool    text not null check (pool ~ '^[uo]:[0-9a-f-]{36}$'),
  month   date not null,
  seconds bigint not null default 0 check (seconds >= 0),
  primary key (pool, month)
);

create table public.meet_topups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,   -- who paid
  pool         text not null check (pool ~ '^[uo]:[0-9a-f-]{36}$'),
  packs        integer not null check (packs between 1 and 20),
  seconds      bigint not null check (seconds > 0),
  used_seconds bigint not null default 0 check (used_seconds >= 0 and used_seconds <= seconds),
  amount_kobo  integer not null check (amount_kobo > 0),
  reference    text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  paid_at      timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index meet_topups_pool_idx on public.meet_topups (pool, expires_at) where status = 'success';
create index meet_topups_user_idx on public.meet_topups (user_id);

-- Which pool a meeting draws from, and whether its cameras are off. Kept apart from meet_rooms,
-- which everyone in the meeting can read.
create table public.meet_room_usage (
  room_id uuid primary key references public.meet_rooms (id) on delete cascade,
  pool    text not null check (pool ~ '^[uo]:[0-9a-f-]{36}$')
);
create index meet_room_usage_pool_idx on public.meet_room_usage (pool);

alter table public.meet_rooms add column if not exists cameras_off boolean not null default false;

alter table public.meet_usage enable row level security;
alter table public.meet_topups enable row level security;
alter table public.meet_room_usage enable row level security;
revoke all on public.meet_usage, public.meet_topups, public.meet_room_usage from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pools and allowances
-- ---------------------------------------------------------------------------
create or replace function private.meet_personal_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meet_subscriptions s
                 where s.user_id = p_user and s.plan = 'pro' and s.status = 'success'
                   and s.period_start <= now() and s.period_end > now())
$$;

-- Included seconds this month for a company: Workbase Standard/Pro (5 h per paid person, at
-- least 20 h) + Meet Business (400 h). 0 when neither covers it.
create or replace function private.meet_org_included(p_org uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_seats integer := 0;
  v_wb boolean := false;
  v_biz boolean;
begin
  select b.tier in ('standard', 'pro'), b.paid_seats into v_wb, v_seats from private.org_billing(p_org) b;
  v_biz := exists (select 1 from public.meet_subscriptions s
                   where s.organization_id = p_org and s.plan = 'business' and s.status = 'success'
                     and s.period_start <= now() and s.period_end > now());
  return (case when coalesce(v_wb, false) then greatest(20, 5 * coalesce(v_seats, 0)) else 0 end
        + case when v_biz then 400 else 0 end)::bigint * 3600;
end $$;

-- The pool a host draws from, their tier, and the pool's monthly allowance.
create or replace function private.meet_pool(p_user uuid)
returns table (pool text, tier text, included bigint, org uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_wb boolean;
  v_biz boolean;
  v_rank integer;
begin
  if private.meet_personal_pro(p_user) then
    return query select 'u:' || p_user::text, 'pro'::text, (60 * 3600)::bigint, null::uuid;
    return;
  end if;
  select m.organization_id into v_org from public.memberships m where m.user_id = p_user and m.status = 'active' limit 1;
  if v_org is not null then
    v_wb := exists (select 1 from private.org_billing(v_org) b where b.tier in ('standard', 'pro'));
    v_biz := exists (select 1 from public.meet_subscriptions s
                     where s.organization_id = v_org and s.plan = 'business' and s.status = 'success'
                       and s.period_start <= now() and s.period_end > now());
    if v_biz and not v_wb then
      -- Meet Business covers the first 10 active members (owner first, then by joining date).
      select r.rank into v_rank from (
        select m.user_id, row_number() over (order by (m.role = 'owner') desc, m.created_at, m.user_id) as rank
        from public.memberships m where m.organization_id = v_org and m.status = 'active'
      ) r where r.user_id = p_user;
    end if;
    if v_wb or (v_biz and v_rank <= 10) then
      return query select 'o:' || v_org::text, 'pro'::text, private.meet_org_included(v_org), v_org;
      return;
    end if;
  end if;
  return query select 'u:' || p_user::text, 'free'::text, (15 * 3600)::bigint, null::uuid;
end $$;

-- Allowance of a pool from its key (a meeting keeps its pool even if the host's plan changes).
create or replace function private.meet_pool_included(p_pool text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := substr(p_pool, 3)::uuid;
begin
  if left(p_pool, 2) = 'o:' then return private.meet_org_included(v_id); end if;
  return case when private.meet_personal_pro(v_id) then 60 * 3600 else 15 * 3600 end;
end $$;

-- 'pro' or 'free' (same answer as before, Business now covers 10 hosts).
create or replace function private.meet_tier(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.tier from private.meet_pool(p_user) p
$$;

-- Where a pool stands this month. used = counted time + time running now in live meetings.
create or replace function private.meet_pool_status(p_pool text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_included bigint := private.meet_pool_included(p_pool);
  v_counted bigint;
  v_running bigint;
  v_topups bigint;
  v_used bigint;
begin
  select coalesce(sum(u.seconds), 0) into v_counted from public.meet_usage u where u.pool = p_pool and u.month = private.meet_month();
  select coalesce(sum(greatest(0, extract(epoch from least(now(), s.last_seen_at + interval '15 seconds') - p.joined_at))), 0)::bigint
    into v_running
  from public.meet_room_usage ru
  join public.meet_rooms r on r.id = ru.room_id and r.ended_at is null
  join public.meet_participants p on p.room_id = r.id and p.status = 'admitted'
  join public.meet_presence s on s.participant_id = p.id
  where ru.pool = p_pool;
  select coalesce(sum(t.seconds - t.used_seconds), 0) into v_topups from public.meet_topups t
  where t.pool = p_pool and t.status = 'success' and t.expires_at > now();
  v_used := v_counted + v_running;
  return jsonb_build_object(
    'included', v_included,
    'used', v_used,
    -- Running time beyond the allowance hasn't been taken from top-ups yet: show it as used.
    'topup_left', greatest(0, v_topups - greatest(0, v_used - greatest(v_included, v_counted))),
    'left', greatest(0, v_included - v_used) + greatest(0, v_topups - greatest(0, v_used - greatest(v_included, v_counted))),
    'percent', case when v_included > 0 then least(999, round(100.0 * v_used / v_included))::int else 100 end,
    'resets_at', ((private.meet_month() + interval '1 month')::timestamp at time zone 'Africa/Lagos')
  );
end $$;

-- Count time against a pool: first the month's allowance, then top-ups (soonest to expire first).
create or replace function private.meet_charge(p_pool text, p_seconds bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_included bigint;
  v_new bigint;
  v_over bigint;
  t record;
  v_take bigint;
begin
  if p_pool is null or coalesce(p_seconds, 0) <= 0 then return; end if;
  v_included := private.meet_pool_included(p_pool);
  insert into public.meet_usage as u (pool, month, seconds) values (p_pool, private.meet_month(), p_seconds)
  on conflict (pool, month) do update set seconds = u.seconds + excluded.seconds
  returning u.seconds into v_new;
  v_over := greatest(v_new - v_included, 0) - greatest(v_new - p_seconds - v_included, 0);
  for t in select x.id, x.seconds - x.used_seconds as left_s from public.meet_topups x
           where x.pool = p_pool and x.status = 'success' and x.expires_at > now() and x.used_seconds < x.seconds
           order by x.expires_at, x.id for update loop
    exit when v_over <= 0;
    v_take := least(v_over, t.left_s);
    update public.meet_topups set used_seconds = used_seconds + v_take where id = t.id;
    v_over := v_over - v_take;
  end loop;
end $$;

-- Attendance counting (0037) + charging the meeting's pool. Charging never blocks leaving.
create or replace function private.meet_count_time()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_seen timestamptz;
  v_end  timestamptz;
  v_secs integer;
begin
  if new.status = 'admitted' and (tg_op = 'INSERT' or old.status is distinct from 'admitted') then
    new.first_joined_at := coalesce(new.first_joined_at, new.joined_at);
    new.visits := least(new.visits + 1, 30000);
  elsif tg_op = 'UPDATE' and old.status = 'admitted' and new.status <> 'admitted' then
    select s.last_seen_at into v_seen from public.meet_presence s where s.participant_id = old.id;
    v_end := least(coalesce(new.left_at, now()), coalesce(v_seen + interval '15 seconds', 'infinity'::timestamptz));
    if v_end > old.joined_at then
      v_secs := least(floor(extract(epoch from v_end - old.joined_at))::bigint, 2000000000)::int;
      new.seconds_in := least(new.seconds_in::bigint + v_secs, 2000000000)::int;
      begin
        perform private.meet_charge((select ru.pool from public.meet_room_usage ru where ru.room_id = new.room_id), v_secs);
      exception when others then
        null;
      end;
    end if;
  end if;
  return new;
end $$;

-- Paying turns cameras back on in that pool's live meetings.
create or replace function private.meet_cameras_back(p_pool text)
returns void language sql security definer set search_path = '' as $$
  update public.meet_rooms r set cameras_off = false
  from public.meet_room_usage ru
  where ru.room_id = r.id and ru.pool = p_pool and r.ended_at is null and r.cameras_off
    and (private.meet_pool_status(p_pool) ->> 'left')::bigint > 0
$$;

-- ---------------------------------------------------------------------------
-- Meetings: start with the pool's limits; tell people when cameras are off
-- ---------------------------------------------------------------------------
create or replace function public.meet_join(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_guest boolean := private.meet_is_anonymous();
  r public.meet_rooms;
  me public.meet_participants;
  v_name text;
  v_pool record;
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
    -- The host starts the clock the first time they join; the meeting takes the pool's limits.
    if r.started_at is null then
      select * into v_pool from private.meet_pool(v_uid);
      insert into public.meet_room_usage (room_id, pool) values (r.id, v_pool.pool)
      on conflict (room_id) do update set pool = excluded.pool;
      update public.meet_rooms set started_at = now(),
        ends_at = now() + case when v_pool.tier = 'pro' then interval '24 hours' else interval '60 minutes' end,
        max_participants = case when v_pool.tier = 'pro' then 100 else 25 end,
        cameras_off = (private.meet_pool_status(v_pool.pool) ->> 'left')::bigint <= 0
      where id = r.id returning * into r;
    end if;
    v_status := 'admitted';
  else
    if r.locked and me.admitted_at is null then
      raise exception 'The host locked this meeting.' using errcode = '42501';
    end if;
    if r.started_at is null then
      v_status := 'waiting';
    elsif me.admitted_at is not null then
      v_status := 'admitted';
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
                            'name', me.display_name, 'ends_at', r.ends_at, 'cameras_off', r.cameras_off, 'server_time', now());
end $$;

create or replace function public.meet_room_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.meet_rooms;
  me public.meet_participants;
  v_pool record;
  v_status jsonb;
begin
  select * into r from public.meet_rooms where code = lower(trim(p_code));
  if not found then return null; end if;
  select * into me from public.meet_participants where room_id = r.id and user_id = auth.uid();
  select * into v_pool from private.meet_pool(r.host_id);
  -- The host sees how much meeting time is left before starting (percent only).
  if r.host_id = auth.uid() and r.started_at is null then
    v_status := private.meet_pool_status(v_pool.pool);
  end if;
  return jsonb_build_object(
    'id', r.id, 'code', r.code, 'title', r.title,
    'host_name', coalesce(nullif((select full_name from public.profiles where id = r.host_id), ''), 'The host'),
    'is_host', r.host_id = auth.uid(),
    'starts_at', r.starts_at, 'started', r.started_at is not null, 'ended', r.ended_at is not null,
    'ends_at', r.ends_at, 'locked', r.locked, 'allow_guests', r.allow_guests, 'waiting_room', r.waiting_room,
    'host_tier', v_pool.tier, 'limit_minutes', case when v_pool.tier = 'pro' then 1440 else 60 end,
    'my_status', me.status, 'my_name', me.display_name,
    'in_meeting', private.meet_live_count(r.id),
    'recording', r.ended_at is null and exists (select 1 from public.meet_participants p
                                                where p.room_id = r.id and p.status = 'admitted' and p.recording_since is not null),
    'cameras_off', case when r.started_at is not null then r.cameras_off
                        when v_status is not null then (v_status ->> 'left')::bigint <= 0 else false end,
    'usage_percent', (v_status ->> 'percent')::int
  );
end $$;

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
    'cameras_off', r.cameras_off,
    'sessions', coalesce((select jsonb_agg(p.sfu_session) from public.meet_participants p
                          where p.room_id = p_room and p.status = 'admitted' and p.sfu_session is not null), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- My plan + usage; buying plans and top-ups
-- ---------------------------------------------------------------------------
create or replace function public.meet_my_plan()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pool record;
  v_admin boolean;
begin
  select * into v_pool from private.meet_pool(v_uid);
  v_admin := exists (select 1 from public.memberships m where m.user_id = v_uid and m.status = 'active' and m.role in ('owner', 'admin'));
  return jsonb_build_object(
    'tier', v_pool.tier,
    'pro_price_kobo', private.meet_price_kobo('pro'),
    'business_price_kobo', private.meet_price_kobo('business'),
    'topup_price_kobo', private.meet_price_kobo('topup'),
    'paid_until', (select max(s.period_end) from public.meet_subscriptions s
                   where s.user_id = v_uid and s.status = 'success' and s.period_end > now()),
    'org_id', (select m.organization_id from public.memberships m where m.user_id = v_uid and m.status = 'active' limit 1),
    'is_org_admin', v_admin,
    'pool_kind', case when left(v_pool.pool, 2) = 'o:' then 'company' else 'personal' end,
    'company_name', case when v_pool.org is not null then (select o.name from public.organizations o where o.id = v_pool.org) end,
    'can_top_up', not private.meet_is_anonymous() and (left(v_pool.pool, 2) = 'u:' or v_admin),
    'usage', private.meet_pool_status(v_pool.pool)
  );
end $$;

-- Start a top-up payment (15 person-hours per pack). Company pools: owner/admin only.
create or replace function public.meet_start_topup(p_packs integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pool record;
  v_amount integer;
  v_ref text;
begin
  if v_uid is null or private.meet_is_anonymous() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_packs is null or p_packs not between 1 and 20 then raise exception 'Choose 1 to 20 packs' using errcode = '22023'; end if;
  select * into v_pool from private.meet_pool(v_uid);
  if left(v_pool.pool, 2) = 'o:' and not exists (
       select 1 from public.memberships m where m.user_id = v_uid and m.organization_id = v_pool.org
         and m.status = 'active' and m.role in ('owner', 'admin')) then
    raise exception 'Your company shares meeting time. Ask its owner or an admin to top up.' using errcode = '42501';
  end if;
  if (select count(*) from public.meet_topups where user_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many tries. Wait a little.' using errcode = '54000';
  end if;
  v_amount := private.meet_price_kobo('topup') * p_packs;
  v_ref := 'meet_top_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.meet_topups (user_id, pool, packs, seconds, amount_kobo, reference)
  values (v_uid, v_pool.pool, p_packs, p_packs * 15 * 3600, v_amount, v_ref);
  return jsonb_build_object('reference', v_ref, 'amount_kobo', v_amount,
                            'email', (select email from public.profiles where id = v_uid));
end $$;

-- Start a plan payment (Pro = one host; Business = a company, covering its first 10 hosts).
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

-- Server only (service role, after Paystack confirms). Plans stack after the current period;
-- top-ups last 12 months. Either way cameras come back on in that pool's live meetings.
create or replace function public.meet_confirm_payment(p_reference text, p_amount_kobo integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  s public.meet_subscriptions;
  t public.meet_topups;
  v_start timestamptz;
begin
  if p_reference like 'meet\_top\_%' then
    select * into t from public.meet_topups where reference = p_reference for update;
    if not found then return false; end if;
    if t.status = 'success' then return true; end if;
    if p_amount_kobo < t.amount_kobo then
      update public.meet_topups set status = 'failed' where id = t.id;
      return false;
    end if;
    update public.meet_topups set status = 'success', paid_at = now(), expires_at = now() + interval '12 months' where id = t.id;
    perform private.meet_cameras_back(t.pool);
    return true;
  end if;

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
  perform private.meet_cameras_back(case when s.plan = 'pro' then 'u:' || s.user_id::text else 'o:' || s.organization_id::text end);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Owner console: money now includes top-ups; meeting time this month (no names)
-- ---------------------------------------------------------------------------
create or replace function private.admin_revenue()
returns table (product text, organization_id uuid, user_id uuid, reference text, amount_kobo bigint, paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'workbase_' || p.plan, p.organization_id, p.created_by, p.reference, p.amount_kobo, coalesce(p.paid_at, p.created_at)
    from public.payments p where p.status = 'success' and p.amount_kobo > 0
  union all
  select 'meet_' || s.plan, s.organization_id, s.user_id, s.reference, s.amount_kobo::bigint, coalesce(s.period_start, s.created_at)
    from public.meet_subscriptions s where s.status = 'success'
  union all
  select 'meet_topup', case when left(t.pool, 2) = 'o:' then substr(t.pool, 3)::uuid end, t.user_id, t.reference, t.amount_kobo::bigint, t.paid_at
    from public.meet_topups t where t.status = 'success'
  union all
  select 'book_pro', null, s.user_id, s.reference, s.amount_kobo::bigint, coalesce(s.period_start, s.created_at)
    from public.book_subscriptions s where s.status = 'success'
  union all
  select 'book_fees', null, pg.owner_id, b.pay_reference, b.fee_kobo::bigint, b.paid_at
    from public.book_bookings b join public.book_pages pg on pg.id = b.page_id
    where b.paid_at is not null and b.fee_kobo > 0
  union all
  select 'forms_fees', null, r.owner_id, r.pay_reference, r.fee_kobo::bigint, r.paid_at
    from public.form_responses r where r.status = 'paid' and r.fee_kobo > 0
$$;

-- Meeting time by month (person-hours) split by plan kind, top-ups sold, pools near their limit.
create or replace function public.admin_meet_usage(p_months integer default 6)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
               'free_seconds', coalesce((select sum(u.seconds) from public.meet_usage u
                                         where u.month = g.m and left(u.pool, 2) = 'u:' and not exists (
                                           select 1 from public.meet_subscriptions s where s.status = 'success' and s.plan = 'pro'
                                             and 'u:' || s.user_id::text = u.pool and s.period_start < g.m + interval '1 month' and s.period_end > g.m)), 0),
               'paid_seconds', coalesce((select sum(u.seconds) from public.meet_usage u where u.month = g.m), 0)
                 - coalesce((select sum(u.seconds) from public.meet_usage u
                             where u.month = g.m and left(u.pool, 2) = 'u:' and not exists (
                               select 1 from public.meet_subscriptions s where s.status = 'success' and s.plan = 'pro'
                                 and 'u:' || s.user_id::text = u.pool and s.period_start < g.m + interval '1 month' and s.period_end > g.m)), 0))
             order by g.m)
      from (select generate_series(private.meet_month() - make_interval(months => least(greatest(coalesce(p_months, 6), 1), 24) - 1),
                                   private.meet_month(), interval '1 month')::date as m) g), '[]'::jsonb),
    'pools_this_month', (select count(*) from public.meet_usage u where u.month = private.meet_month()),
    'pools_over_80', (select count(*) from public.meet_usage u
                      where u.month = private.meet_month() and u.seconds >= 0.8 * greatest(private.meet_pool_included(u.pool), 1)),
    'cameras_off_live', (select count(*) from public.meet_rooms r where r.ended_at is null and r.started_at is not null and r.cameras_off),
    'topups', (select jsonb_build_object('count', count(*), 'kobo', coalesce(sum(t.amount_kobo), 0),
                                         'hours_left', coalesce(sum(t.seconds - t.used_seconds) filter (where t.expires_at > now()), 0) / 3600)
               from public.meet_topups t where t.status = 'success')
  )
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function private.meet_month(), private.meet_personal_pro(uuid), private.meet_org_included(uuid),
  private.meet_pool(uuid), private.meet_pool_included(text), private.meet_pool_status(text),
  private.meet_charge(text, bigint), private.meet_cameras_back(text) from public, anon, authenticated;
revoke execute on function public.meet_start_topup(integer) from public, anon;
grant execute on function public.meet_start_topup(integer) to authenticated;
revoke execute on function public.meet_confirm_payment(text, integer) from public, anon, authenticated;
grant execute on function public.meet_confirm_payment(text, integer) to service_role;
revoke execute on function public.admin_meet_usage(integer) from public, anon, authenticated;
grant execute on function public.admin_meet_usage(integer) to service_role;
