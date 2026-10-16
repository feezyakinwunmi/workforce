-- Workbase Book: booking pages with optional payment, a separate product on the same accounts.
--
-- A host (any signed-in, non-guest account) has one page (book…/handle) with services. Customers
-- don't need an account: they pick a free time, leave name + email (+ phone) and, if the service
-- asks for it, pay through Paystack. Money goes straight to the host's bank account (Paystack
-- subaccount); Workbase keeps a 3% fee on the Free plan and nothing on Book Pro.
-- Customers manage a booking with a private link (manage_token).
-- Emails (confirmation, cancellation, reminders 24 h and 1 h before) go through one queue that the
-- website claims with the service role: book_claim_mail().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.book_pages (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  handle           text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  name             text not null check (char_length(trim(name)) between 1 and 80),
  about            text not null default '' check (char_length(about) <= 500),
  timezone         text not null default 'Africa/Lagos',
  color            text not null default '#6a4cf5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active           boolean not null default true,
  -- Payouts: written only by the server after Paystack accepts the bank account.
  subaccount_code  text,
  bank_name        text,
  account_last4    text,
  account_name     text,
  created_at       timestamptz not null default now()
);

create table public.book_services (
  id               uuid primary key default gen_random_uuid(),
  page_id          uuid not null references public.book_pages (id) on delete cascade,
  title            text not null check (char_length(trim(title)) between 1 and 80),
  description      text not null default '' check (char_length(description) <= 1000),
  duration_min     integer not null default 30 check (duration_min between 10 and 480),
  price_kobo       integer not null default 0 check (price_kobo between 0 and 100000000),
  pay_now_kobo     integer not null default 0 check (pay_now_kobo >= 0),       -- 0 = nothing to pay when booking
  location         text not null default 'meet' check (location in ('meet', 'in_person', 'phone')),
  location_detail  text not null default '' check (char_length(location_detail) <= 300),
  buffer_min       integer not null default 0 check (buffer_min between 0 and 120),
  notice_min       integer not null default 120 check (notice_min between 0 and 20160),
  max_days         integer not null default 60 check (max_days between 1 and 180),
  daily_limit      integer check (daily_limit between 1 and 50),
  active           boolean not null default true,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  check (pay_now_kobo <= price_kobo),
  check (pay_now_kobo = 0 or pay_now_kobo >= 10000)                             -- Paystack minimum ₦100
);
create index book_services_page_idx on public.book_services (page_id, position);

-- Weekly opening hours, in the page's time zone (minutes after midnight). 0 = Sunday.
create table public.book_hours (
  id        uuid primary key default gen_random_uuid(),
  page_id   uuid not null references public.book_pages (id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  start_min smallint not null check (start_min between 0 and 1439),
  end_min   smallint not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);
create index book_hours_page_idx on public.book_hours (page_id, weekday);

create table public.book_days_off (
  page_id uuid not null references public.book_pages (id) on delete cascade,
  day     date not null,
  primary key (page_id, day)
);

create table public.book_bookings (
  id                 uuid primary key default gen_random_uuid(),
  page_id            uuid not null references public.book_pages (id) on delete cascade,
  service_id         uuid references public.book_services (id) on delete set null,
  service_title      text not null,
  location           text not null,
  duration_min       integer not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  busy_from          timestamptz not null,                -- with the service's buffer
  busy_to            timestamptz not null,
  customer_name      text not null check (char_length(trim(customer_name)) between 1 and 80),
  customer_email     text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(customer_email) <= 200),
  customer_phone     text not null default '' check (char_length(customer_phone) <= 30),
  notes              text not null default '' check (char_length(notes) <= 1000),
  status             text not null check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show')),
  price_kobo         integer not null default 0,
  pay_now_kobo       integer not null default 0,
  fee_kobo           integer not null default 0,
  pay_reference      text unique,
  paid_at            timestamptz,
  hold_until         timestamptz,                          -- unpaid booking keeps the time until then
  manage_token       text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  meet_room_id       uuid references public.meet_rooms (id) on delete set null,
  meet_code          text,
  cancelled_at       timestamptz,
  cancelled_by       text check (cancelled_by in ('customer', 'host', 'system')),
  cancel_reason      text not null default '' check (char_length(cancel_reason) <= 300),
  confirm_emailed_at timestamptz,
  cancel_emailed_at  timestamptz,
  reminded_24h_at    timestamptz,
  reminded_1h_at     timestamptz,
  created_at         timestamptz not null default now()
);
create index book_bookings_page_time_idx on public.book_bookings (page_id, busy_from);
create index book_bookings_service_idx on public.book_bookings (service_id);
create index book_bookings_email_idx on public.book_bookings (lower(customer_email), created_at);
create index book_bookings_meet_idx on public.book_bookings (meet_room_id);

create table public.book_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  months       integer not null check (months between 1 and 12),
  amount_kobo  integer not null check (amount_kobo > 0),
  reference    text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  period_start timestamptz,
  period_end   timestamptz,
  created_at   timestamptz not null default now()
);
create index book_subscriptions_user_idx on public.book_subscriptions (user_id);

create trigger book_pages_timezone before insert or update of timezone on public.book_pages
  for each row execute function private.check_timezone();

alter table public.book_pages enable row level security;
alter table public.book_services enable row level security;
alter table public.book_hours enable row level security;
alter table public.book_days_off enable row level security;
alter table public.book_bookings enable row level security;
alter table public.book_subscriptions enable row level security;

revoke all on public.book_pages, public.book_services, public.book_hours, public.book_days_off,
  public.book_bookings, public.book_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Names that can't be a page address (they are pages of Book itself).
create or replace function private.book_reserved(p_handle text)
returns boolean language sql immutable set search_path = '' as $$
  select p_handle = any (array['b', 'pay', 'api', 'book', 'meet', 'services', 'availability', 'settings', 'bookings',
    'pricing', 'login', 'signup', 'dashboard', 'admin', 'help', 'about', 'terms', 'privacy', 'support', 'workbase',
    'phantomire', 'www', 'app', 'new', 'setup', 'auth', 'static'])
$$;

create or replace function private.guard_book_page()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.handle := lower(trim(new.handle));
  if private.book_reserved(new.handle) then
    raise exception 'That address is taken. Try another.' using errcode = '23505';
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean, false) then
      raise exception 'Sign up to create a booking page' using errcode = '42501';
    end if;
    new.owner_id := coalesce(auth.uid(), new.owner_id);
    new.created_at := now();
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  -- Custom colour is a Book Pro feature.
  if new.color <> '#6a4cf5' and (tg_op = 'INSERT' or new.color <> old.color) and private.book_tier(new.owner_id) <> 'pro' then
    new.color := coalesce(old.color, '#6a4cf5');
  end if;
  return new;
end $$;

create or replace function private.book_price_kobo()
returns integer language sql immutable set search_path = '' as $$ select 200000 $$;   -- ₦2,000 a month

create or replace function private.book_tier(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.book_subscriptions s
                           where s.user_id = p_user and s.status = 'success'
                             and s.period_start <= now() and s.period_end > now())
              then 'pro' else 'free' end
$$;

-- Workbase's share of a paid booking: 3% on Free, nothing on Pro.
create or replace function private.book_fee_kobo(p_user uuid, p_amount integer)
returns integer language sql stable set search_path = '' as $$
  select case when p_amount <= 0 or private.book_tier(p_user) = 'pro' then 0 else ceil(p_amount * 0.03)::integer end
$$;

create trigger book_pages_guard before insert or update on public.book_pages
  for each row execute function private.guard_book_page();

-- The services of a page must stay on that page.
create or replace function private.guard_book_child()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.page_id <> old.page_id then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger book_services_guard before update on public.book_services for each row execute function private.guard_book_child();
create trigger book_hours_guard before update on public.book_hours for each row execute function private.guard_book_child();

create or replace function private.book_owns(p_page uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.book_pages p where p.id = p_page and p.owner_id = auth.uid())
$$;

-- Free start times of one service from a local date, for p_days days (page time zone).
-- p_ignore: a booking to leave out of the busy check (used when confirming a late payment).
create or replace function private.book_slot_list(p_service uuid, p_from date, p_days integer, p_ignore uuid default null)
returns setof timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  s public.book_services;
  pg public.book_pages;
  d date;
  today date;
  h record;
  t integer;
  step integer;
  v_start timestamptz;
  v_end timestamptz;
  v_used integer;
begin
  select * into s from public.book_services where id = p_service;
  if not found or not s.active then return; end if;
  select * into pg from public.book_pages where id = s.page_id;
  if not pg.active then return; end if;
  today := (now() at time zone pg.timezone)::date;
  step := case when s.duration_min < 30 then s.duration_min else 30 end;
  for i in 0 .. least(greatest(p_days, 1), 62) - 1 loop
    d := p_from + i;
    continue when d < today;
    exit when d > today + s.max_days;
    continue when exists (select 1 from public.book_days_off o where o.page_id = pg.id and o.day = d);
    if s.daily_limit is not null then
      select count(*) into v_used from public.book_bookings b
      where b.service_id = s.id and b.id is distinct from p_ignore
        and (b.status in ('confirmed', 'completed') or (b.status = 'pending_payment' and b.hold_until > now()))
        and (b.starts_at at time zone pg.timezone)::date = d;
      continue when v_used >= s.daily_limit;
    end if;
    for h in select x.start_min, x.end_min from public.book_hours x
             where x.page_id = pg.id and x.weekday = extract(dow from d)::integer order by x.start_min loop
      t := h.start_min;
      while t + s.duration_min <= h.end_min loop
        v_start := (d::timestamp + make_interval(mins => t)) at time zone pg.timezone;
        v_end := v_start + make_interval(mins => s.duration_min);
        if v_start >= now() + make_interval(mins => s.notice_min)
           and not exists (
             select 1 from public.book_bookings b
             where b.page_id = pg.id and b.id is distinct from p_ignore
               and (b.status = 'confirmed' or (b.status = 'pending_payment' and b.hold_until > now()))
               and b.busy_from < v_end + make_interval(mins => s.buffer_min)
               and b.busy_to > v_start - make_interval(mins => s.buffer_min)) then
          return next v_start;
        end if;
        t := t + step;
      end loop;
    end loop;
  end loop;
end $$;

-- An online booking gets its own Workbase Meet room (the host admits the customer).
create or replace function private.book_make_meet(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.book_bookings;
  v_owner uuid;
  v_room uuid;
  v_code text;
begin
  select * into b from public.book_bookings where id = p_booking;
  if b.location <> 'meet' or b.meet_room_id is not null then return; end if;
  select owner_id into v_owner from public.book_pages where id = b.page_id;
  v_code := private.meet_new_code();
  insert into public.meet_rooms (code, host_id, title, starts_at, duration_minutes, waiting_room, allow_guests)
  values (v_code, v_owner, left(b.service_title || ' · ' || b.customer_name, 120), b.starts_at,
          least(greatest(b.duration_min + 15, 5), 1440), true, true)
  returning id into v_room;
  update public.book_bookings set meet_room_id = v_room, meet_code = v_code where id = b.id;
end $$;

-- ---------------------------------------------------------------------------
-- Policies (hosts manage their own page; customers go through the functions below)
-- ---------------------------------------------------------------------------
create policy "owner reads own page" on public.book_pages for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner creates own page" on public.book_pages for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner edits own page" on public.book_pages for update to authenticated using (owner_id = (select auth.uid()));

create policy "owner manages services" on public.book_services for all to authenticated
  using ((select private.book_owns(page_id))) with check ((select private.book_owns(page_id)));
create policy "owner manages hours" on public.book_hours for all to authenticated
  using ((select private.book_owns(page_id))) with check ((select private.book_owns(page_id)));
create policy "owner manages days off" on public.book_days_off for all to authenticated
  using ((select private.book_owns(page_id))) with check ((select private.book_owns(page_id)));
create policy "owner reads bookings" on public.book_bookings for select to authenticated
  using ((select private.book_owns(page_id)));
create policy "payer reads own Book plans" on public.book_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.book_pages, public.book_services, public.book_hours, public.book_days_off,
  public.book_bookings, public.book_subscriptions to authenticated;
grant insert (handle, name, about, timezone, color) on public.book_pages to authenticated;
grant update (handle, name, about, timezone, color, active) on public.book_pages to authenticated;
grant insert (page_id, title, description, duration_min, price_kobo, pay_now_kobo, location, location_detail,
              buffer_min, notice_min, max_days, daily_limit, active, position) on public.book_services to authenticated;
grant update (title, description, duration_min, price_kobo, pay_now_kobo, location, location_detail,
              buffer_min, notice_min, max_days, daily_limit, active, position) on public.book_services to authenticated;
grant delete on public.book_services, public.book_hours, public.book_days_off to authenticated;
grant insert (page_id, weekday, start_min, end_min) on public.book_hours to authenticated;
grant insert (page_id, day) on public.book_days_off to authenticated;

-- ---------------------------------------------------------------------------
-- Functions for customers (no account needed)
-- ---------------------------------------------------------------------------
-- A page and its services.
create or replace function public.book_public(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'handle', p.handle, 'name', p.name, 'about', p.about, 'timezone', p.timezone, 'color', p.color,
    'pro', private.book_tier(p.owner_id) = 'pro', 'payments', p.subaccount_code is not null,
    'services', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'description', s.description, 'duration_min', s.duration_min,
        'price_kobo', s.price_kobo, 'pay_now_kobo', s.pay_now_kobo, 'location', s.location,
        'max_days', s.max_days) order by s.position, s.created_at)
      from public.book_services s where s.page_id = p.id and s.active), '[]'::jsonb))
  from public.book_pages p where p.handle = lower(p_handle) and p.active
$$;

-- Free times of a service: { timezone, slots: [timestamps] }.
create or replace function public.book_slots(p_handle text, p_service uuid, p_from date, p_days integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('timezone', p.timezone,
    'slots', coalesce((select jsonb_agg(x order by x) from private.book_slot_list(s.id, p_from, least(p_days, 42)) x), '[]'::jsonb))
  from public.book_pages p join public.book_services s on s.page_id = p.id
  where p.handle = lower(p_handle) and s.id = p_service
$$;

-- Book a time. Free → confirmed at once; to pay → held for 15 minutes while the customer pays.
create or replace function public.book_create(p_handle text, p_service uuid, p_starts_at timestamptz,
  p_name text, p_email text, p_phone text default '', p_notes text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pg public.book_pages;
  s public.book_services;
  b public.book_bookings;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ref text;
  v_fee integer;
begin
  select * into pg from public.book_pages where handle = lower(p_handle) and active;
  if not found then raise exception 'This booking page doesn''t exist' using errcode = 'P0002'; end if;
  select * into s from public.book_services where id = p_service and page_id = pg.id and active;
  if not found then raise exception 'This service isn''t available any more' using errcode = 'P0002'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter your name' using errcode = '22023'; end if;
  if s.pay_now_kobo > 0 and pg.subaccount_code is null then
    raise exception 'This host can''t take payments yet. Please contact them directly.' using errcode = '55000';
  end if;

  -- One booking at a time per page, so two people can't take the same time.
  perform pg_advisory_xact_lock(hashtextextended('book:' || pg.id::text, 0));

  if (select count(*) from public.book_bookings x where lower(x.customer_email) = v_email
      and x.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many bookings from this email. Try again later.' using errcode = '54000';
  end if;
  if (select count(*) from public.book_bookings x where x.page_id = pg.id and x.status = 'pending_payment'
      and x.hold_until > now()) >= 20 then
    raise exception 'Lots of people are booking right now. Try again in a few minutes.' using errcode = '54000';
  end if;
  if not exists (select 1 from private.book_slot_list(s.id, (p_starts_at at time zone pg.timezone)::date, 1) x where x = p_starts_at) then
    raise exception 'That time was just taken. Please pick another.' using errcode = '23P01';
  end if;

  v_fee := private.book_fee_kobo(pg.owner_id, s.pay_now_kobo);
  v_ref := case when s.pay_now_kobo > 0 then 'book_' || replace(gen_random_uuid()::text, '-', '') end;
  insert into public.book_bookings (page_id, service_id, service_title, location, duration_min, starts_at, ends_at,
    busy_from, busy_to, customer_name, customer_email, customer_phone, notes, status, price_kobo, pay_now_kobo,
    fee_kobo, pay_reference, hold_until)
  values (pg.id, s.id, s.title, s.location, s.duration_min, p_starts_at, p_starts_at + make_interval(mins => s.duration_min),
    p_starts_at - make_interval(mins => s.buffer_min), p_starts_at + make_interval(mins => s.duration_min + s.buffer_min),
    left(trim(p_name), 80), v_email, left(trim(coalesce(p_phone, '')), 30), left(trim(coalesce(p_notes, '')), 1000),
    case when s.pay_now_kobo > 0 then 'pending_payment' else 'confirmed' end, s.price_kobo, s.pay_now_kobo,
    v_fee, v_ref, case when s.pay_now_kobo > 0 then now() + interval '15 minutes' end)
  returning * into b;
  if b.status = 'confirmed' then perform private.book_make_meet(b.id); end if;
  return jsonb_build_object('token', b.manage_token, 'status', b.status, 'reference', b.pay_reference,
    'pay_now_kobo', b.pay_now_kobo, 'fee_kobo', b.fee_kobo, 'subaccount', pg.subaccount_code, 'email', b.customer_email);
end $$;

-- A booking by its private link.
create or replace function public.book_get(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'service_title', b.service_title, 'location', b.location,
    'location_detail', coalesce(s.location_detail, ''), 'duration_min', b.duration_min,
    'starts_at', b.starts_at, 'ends_at', b.ends_at, 'customer_name', b.customer_name, 'customer_email', b.customer_email,
    'price_kobo', b.price_kobo, 'pay_now_kobo', b.pay_now_kobo, 'paid', b.paid_at is not null,
    'reference', b.pay_reference, 'hold_until', b.hold_until, 'meet_code', b.meet_code,
    'cancelled_by', b.cancelled_by, 'cancel_reason', b.cancel_reason,
    'page', jsonb_build_object('handle', p.handle, 'name', p.name, 'timezone', p.timezone, 'color', p.color,
                               'pro', private.book_tier(p.owner_id) = 'pro'),
    'can_cancel', b.status in ('confirmed', 'pending_payment') and b.starts_at > now())
  from public.book_bookings b
  join public.book_pages p on p.id = b.page_id
  left join public.book_services s on s.id = b.service_id
  where b.manage_token = p_token and char_length(p_token) = 64
$$;

-- The customer cancels (before it starts). A refund, if any, is between them and the host.
create or replace function public.book_cancel(p_token text, p_reason text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  b public.book_bookings;
begin
  select * into b from public.book_bookings where manage_token = p_token and char_length(p_token) = 64 for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status not in ('confirmed', 'pending_payment') or b.starts_at <= now() then return false; end if;
  update public.book_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
    cancel_reason = left(coalesce(p_reason, ''), 300),
    -- An unpaid hold that never became a booking needs no emails.
    cancel_emailed_at = case when b.status = 'pending_payment' then now() end
  where id = b.id;
  if b.meet_room_id is not null then
    update public.meet_rooms set ended_at = now() where id = b.meet_room_id and ended_at is null;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Functions for hosts
-- ---------------------------------------------------------------------------
-- Mark a booking: completed, no-show, or cancelled by the host.
create or replace function public.book_update_status(p_booking uuid, p_status text, p_reason text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  b public.book_bookings;
begin
  select * into b from public.book_bookings where id = p_booking for update;
  if not found or not private.book_owns(b.page_id) then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if p_status = 'cancelled' then
    if b.status not in ('confirmed', 'pending_payment') then return false; end if;
    update public.book_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'host',
      cancel_reason = left(coalesce(p_reason, ''), 300),
      cancel_emailed_at = case when b.status = 'pending_payment' then now() end
    where id = b.id;
    if b.meet_room_id is not null then
      update public.meet_rooms set ended_at = now() where id = b.meet_room_id and ended_at is null;
    end if;
  elsif p_status in ('completed', 'no_show') then
    if b.status not in ('confirmed', 'completed', 'no_show') or b.starts_at > now() then return false; end if;
    update public.book_bookings set status = p_status where id = b.id;
  else
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  return true;
end $$;

-- My plan and fee, for the Book home and pricing pages.
create or replace function public.book_my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', private.book_tier(auth.uid()),
    'price_kobo', private.book_price_kobo(),
    'paid_until', (select max(s.period_end) from public.book_subscriptions s
                   where s.user_id = auth.uid() and s.status = 'success' and s.period_end > now()))
$$;

create or replace function public.book_start_payment(p_months integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_amount integer;
  v_ref text;
begin
  if v_uid is null or coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_months not in (1, 3, 6, 12) then raise exception 'Choose 1, 3, 6 or 12 months' using errcode = '22023'; end if;
  v_amount := private.book_price_kobo() * (case when p_months = 12 then 10 else p_months end);
  v_ref := 'bookpro_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.book_subscriptions (user_id, months, amount_kobo, reference) values (v_uid, p_months, v_amount, v_ref);
  return jsonb_build_object('reference', v_ref, 'amount_kobo', v_amount, 'email', (select email from public.profiles where id = v_uid));
end $$;

-- ---------------------------------------------------------------------------
-- Server only (service role)
-- ---------------------------------------------------------------------------
-- After Paystack accepts the host's bank account.
create or replace function public.book_set_payout(p_user uuid, p_code text, p_bank text, p_last4 text, p_account_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.book_pages set subaccount_code = p_code, bank_name = left(p_bank, 80),
    account_last4 = left(p_last4, 4), account_name = left(p_account_name, 120)
  where owner_id = p_user;
  return found;
end $$;

-- After Paystack confirms a booking payment.
create or replace function public.book_confirm_payment(p_reference text, p_amount_kobo integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  b public.book_bookings;
  v_svc public.book_services;
  v_tz text;
begin
  select * into b from public.book_bookings where pay_reference = p_reference for update;
  if not found then return false; end if;
  if b.paid_at is not null then return true; end if;
  if p_amount_kobo < b.pay_now_kobo then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('book:' || b.page_id::text, 0));
  update public.book_bookings set paid_at = now() where id = b.id;
  if b.status = 'pending_payment' and b.hold_until > now() then
    update public.book_bookings set status = 'confirmed', hold_until = null where id = b.id;
  elsif b.status in ('pending_payment', 'cancelled') and b.cancelled_by is distinct from 'customer'
        and b.cancelled_by is distinct from 'host' then
    -- Paid after the hold ran out: keep it if the time is still free, otherwise tell both sides.
    select * into v_svc from public.book_services where id = b.service_id;
    select timezone into v_tz from public.book_pages where id = b.page_id;
    if v_svc.id is not null and exists (select 1 from private.book_slot_list(v_svc.id, (b.starts_at at time zone v_tz)::date, 1, b.id) x
                                        where x = b.starts_at) then
      update public.book_bookings set status = 'confirmed', hold_until = null, cancelled_at = null, cancelled_by = null,
        cancel_reason = '', cancel_emailed_at = null where id = b.id;
    else
      update public.book_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
        cancel_reason = 'Paid after the time was taken by someone else. The host will refund you.', cancel_emailed_at = null
      where id = b.id;
      return true;
    end if;
  end if;
  perform private.book_make_meet(b.id);
  return true;
end $$;

create or replace function public.book_confirm_plan(p_reference text, p_amount_kobo integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  s public.book_subscriptions;
  v_start timestamptz;
begin
  select * into s from public.book_subscriptions where reference = p_reference for update;
  if not found then return false; end if;
  if s.status = 'success' then return true; end if;
  if p_amount_kobo < s.amount_kobo then
    update public.book_subscriptions set status = 'failed' where id = s.id;
    return false;
  end if;
  select greatest(now(), coalesce(max(x.period_end), now())) into v_start from public.book_subscriptions x
  where x.status = 'success' and x.user_id = s.user_id;
  update public.book_subscriptions set status = 'success', period_start = v_start,
    period_end = v_start + make_interval(months => s.months) where id = s.id;
  return true;
end $$;

-- Emails that are due (confirmation, cancellation, reminders); each is handed out once.
create or replace function public.book_claim_mail()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_jobs jsonb := '[]'::jsonb;
  r record;
  v_kind text;
begin
  for r in
    select b.*, p.name as page_name, p.handle, p.timezone, p.color, pr.email as host_email,
           coalesce(nullif(pr.full_name, ''), p.name) as host_name, coalesce(s.location_detail, '') as location_detail
    from public.book_bookings b
    join public.book_pages p on p.id = b.page_id
    join public.profiles pr on pr.id = p.owner_id
    left join public.book_services s on s.id = b.service_id
    where (b.status = 'confirmed' and b.confirm_emailed_at is null and b.created_at > now() - interval '3 days')
       or (b.status = 'cancelled' and b.cancel_emailed_at is null and b.cancelled_at > now() - interval '3 days')
       or (b.status = 'confirmed' and b.confirm_emailed_at is not null and b.reminded_24h_at is null
           and b.starts_at <= now() + interval '24 hours' and b.starts_at > now() + interval '2 hours'
           and b.created_at < b.starts_at - interval '25 hours')
       or (b.status = 'confirmed' and b.confirm_emailed_at is not null and b.reminded_1h_at is null
           and b.starts_at <= now() + interval '65 minutes' and b.starts_at > now()
           and b.created_at < b.starts_at - interval '70 minutes')
    order by b.created_at
    limit 50
    for update of b skip locked
  loop
    if r.status = 'cancelled' then
      v_kind := 'cancelled';
      update public.book_bookings set cancel_emailed_at = now() where id = r.id;
    elsif r.confirm_emailed_at is null then
      v_kind := 'confirmed';
      update public.book_bookings set confirm_emailed_at = now() where id = r.id;
    elsif r.starts_at <= now() + interval '65 minutes' then
      v_kind := 'reminder_1h';
      update public.book_bookings set reminded_1h_at = now(), reminded_24h_at = coalesce(reminded_24h_at, now()) where id = r.id;
    else
      v_kind := 'reminder_24h';
      update public.book_bookings set reminded_24h_at = now() where id = r.id;
    end if;
    v_jobs := v_jobs || jsonb_build_object('kind', v_kind, 'id', r.id, 'token', r.manage_token,
      'service_title', r.service_title, 'location', r.location, 'location_detail', r.location_detail,
      'duration_min', r.duration_min, 'starts_at', r.starts_at, 'customer_name', r.customer_name,
      'customer_email', r.customer_email, 'customer_phone', r.customer_phone, 'notes', r.notes,
      'pay_now_kobo', r.pay_now_kobo, 'price_kobo', r.price_kobo, 'paid', r.paid_at is not null,
      'meet_code', r.meet_code, 'cancelled_by', r.cancelled_by, 'cancel_reason', r.cancel_reason,
      'page_name', r.page_name, 'handle', r.handle, 'timezone', r.timezone, 'color', r.color,
      'host_email', r.host_email, 'host_name', r.host_name);
  end loop;
  return v_jobs;
end $$;

-- Every 5 minutes: let go of unpaid holds, finish old bookings, and ask the website to send due emails.
create or replace function private.book_housekeeping()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Unpaid for 30 minutes after the hold ended: the time is free again (a late payment can still revive it).
  update public.book_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
    cancel_reason = 'Not paid in time', cancel_emailed_at = now()
  where status = 'pending_payment' and hold_until < now() - interval '30 minutes';
  update public.book_bookings set status = 'completed'
  where status = 'confirmed' and ends_at < now() - interval '1 day';
  if exists (select 1 from public.book_bookings b
             where (b.status = 'confirmed' and b.confirm_emailed_at is null and b.created_at > now() - interval '3 days')
                or (b.status = 'cancelled' and b.cancel_emailed_at is null and b.cancelled_at > now() - interval '3 days')
                or (b.status = 'confirmed' and b.reminded_24h_at is null and b.starts_at <= now() + interval '24 hours'
                    and b.starts_at > now() + interval '2 hours' and b.created_at < b.starts_at - interval '25 hours')
                or (b.status = 'confirmed' and b.reminded_1h_at is null and b.starts_at <= now() + interval '65 minutes'
                    and b.starts_at > now() and b.created_at < b.starts_at - interval '70 minutes')) then
    perform net.http_post(
      url := 'https://phantomire-workforce.vercel.app/api/book/mail',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 20000);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function private.book_reserved(text), private.guard_book_page(), private.book_price_kobo(),
  private.book_tier(uuid), private.book_fee_kobo(uuid, integer), private.guard_book_child(),
  private.book_slot_list(uuid, date, integer, uuid), private.book_make_meet(uuid), private.book_housekeeping()
  from public, anon, authenticated;
revoke execute on function private.book_owns(uuid) from public, anon;
grant execute on function private.book_owns(uuid) to authenticated;

revoke execute on function public.book_public(text), public.book_slots(text, uuid, date, integer),
  public.book_create(text, uuid, timestamptz, text, text, text, text), public.book_get(text),
  public.book_cancel(text, text), public.book_update_status(uuid, text, text), public.book_my_plan(),
  public.book_start_payment(integer), public.book_set_payout(uuid, text, text, text, text),
  public.book_confirm_payment(text, integer), public.book_confirm_plan(text, integer), public.book_claim_mail()
  from public, anon, authenticated;
grant execute on function public.book_public(text), public.book_slots(text, uuid, date, integer),
  public.book_create(text, uuid, timestamptz, text, text, text, text), public.book_get(text),
  public.book_cancel(text, text) to anon, authenticated;
grant execute on function public.book_update_status(uuid, text, text), public.book_my_plan(),
  public.book_start_payment(integer) to authenticated;
grant execute on function public.book_set_payout(uuid, text, text, text, text), public.book_confirm_payment(text, integer),
  public.book_confirm_plan(text, integer), public.book_claim_mail() to service_role;

select cron.schedule('book-housekeeping', '*/5 * * * *', 'select private.book_housekeeping()');
