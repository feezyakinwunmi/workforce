-- 1. Clock-in / clock-out reminders.
--    Company work hours live in organizations.settings (work_start "09:00", work_end "17:00",
--    work_days [1..5] = Mon–Fri, clock_reminders true). Each person may set their own hours and
--    turn reminders off (memberships.work_start / work_end / reminders, via update_my_schedule).
--    Every 5 minutes pg_cron runs private.clock_reminders(): on a working day (not a holiday, not
--    on leave) it reminds people who haven't clocked in by their start time, and people still
--    clocked in at their end time. Each reminder is a notification (kind clock_reminder), sent at
--    most once a day; the desktop app shows it as a pop-up with a sound, phones get a push.
-- 2. Push notifications (Web Push) to phones and browsers that turned them on.
--    push_subscriptions: one row per device (the person's own). push_config holds the server's
--    VAPID key pair (no access from the API; the server reads it with the service role).
--    Every minute, if a new notification is waiting for someone with a device, pg_cron calls the
--    dashboard (POST /api/push/dispatch) through pg_net; the dashboard claims and sends them.
-- 3. Sticky notes: private notes, each with a paper colour; only their author sees them.

-- 1 -------------------------------------------------------------------
alter table public.memberships
  add column work_start time,
  add column work_end   time,
  add column reminders  boolean not null default true;

create or replace function public.update_my_schedule(p_start time, p_end time, p_reminders boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;
  if p_start is not null and p_end is not null and p_end <= p_start then
    raise exception 'The end time must be after the start time' using errcode = '22023';
  end if;
  perform set_config('app.trusted_member_change', 'on', true);
  update public.memberships
  set work_start = p_start, work_end = p_end, reminders = coalesce(p_reminders, true)
  where user_id = auth.uid() and status = 'active';
  perform set_config('app.trusted_member_change', '', true);
end $$;
revoke execute on function public.update_my_schedule(time, time, boolean) from public, anon;
grant execute on function public.update_my_schedule(time, time, boolean) to authenticated;

alter table public.notifications add column pushed_at timestamptz;

create or replace function private.clock_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r      record;
  n      integer := 0;
  v_link text;
begin
  for r in
    select m.organization_id, m.user_id, m.timezone,
           (now() at time zone m.timezone) as local_now,
           coalesce(m.work_start, (o.settings ->> 'work_start')::time, time '09:00') as start_t,
           coalesce(m.work_end, (o.settings ->> 'work_end')::time, time '17:00') as end_t,
           coalesce(o.settings -> 'work_days', '[1,2,3,4,5]'::jsonb) as days
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.status = 'active' and m.reminders
      and o.closing_at is null
      and coalesce((o.settings ->> 'clock_reminders')::boolean, true)
  loop
    -- A working day for this person?
    if not (r.days @> to_jsonb(extract(isodow from r.local_now)::int)) then continue; end if;
    if exists (select 1 from public.holidays h where h.organization_id = r.organization_id and h.day = r.local_now::date) then continue; end if;
    if exists (select 1 from public.leave_requests l
               where l.user_id = r.user_id and l.organization_id = r.organization_id and l.status = 'approved'
                 and r.local_now::date between l.start_date and l.end_date) then continue; end if;

    -- Clock in: from the start time for 20 minutes, if not clocked in yet today.
    if r.local_now::time >= r.start_t and r.local_now::time < r.start_t + interval '20 minutes'
       and not exists (select 1 from public.work_sessions s
                       where s.user_id = r.user_id
                         and (s.ended_at is null or (s.started_at at time zone r.timezone)::date = r.local_now::date))
       and private.member_can_track(r.organization_id, r.user_id) then
      v_link := '/dashboard/clock?reminder=in&day=' || r.local_now::date;
      if not exists (select 1 from public.notifications x where x.user_id = r.user_id and x.kind = 'clock_reminder' and x.link = v_link) then
        perform private.notify(r.organization_id, r.user_id, 'clock_reminder', 'Time to clock in',
          'Your work day starts at ' || to_char(r.start_t, 'HH24:MI') || '. Tap to clock in.', v_link, null, null);
        n := n + 1;
      end if;
    end if;

    -- Clock out: from the end time for 20 minutes, if still clocked in.
    if r.local_now::time >= r.end_t and r.local_now::time < r.end_t + interval '20 minutes'
       and exists (select 1 from public.work_sessions s where s.user_id = r.user_id and s.ended_at is null) then
      v_link := '/dashboard/clock?reminder=out&day=' || r.local_now::date;
      if not exists (select 1 from public.notifications x where x.user_id = r.user_id and x.kind = 'clock_reminder' and x.link = v_link) then
        perform private.notify(r.organization_id, r.user_id, 'clock_reminder', 'Time to clock out?',
          'Your work day ended at ' || to_char(r.end_t, 'HH24:MI') || '. Clock out when you are done.', v_link, null, null);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function private.clock_reminders() from public, anon, authenticated;
create index if not exists notifications_user_kind_link_idx on public.notifications (user_id, kind, link);

-- 2 -------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null default auth.uid(),
  endpoint        text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh          text not null check (char_length(p256dh) between 40 and 200),
  auth            text not null check (char_length(auth) between 10 and 100),
  user_agent      text check (char_length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index push_subscriptions_user_idx on public.push_subscriptions (organization_id, user_id);

create or replace function private.guard_push_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.organization_id := private.current_org_id();
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end $$;
create trigger push_subscriptions_guard before insert on public.push_subscriptions
  for each row execute function private.guard_push_subscription();

alter table public.push_subscriptions enable row level security;
create policy "own devices: read" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own devices: add" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()) and organization_id = (select private.current_org_id()));
create policy "own devices: remove" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;

-- The server's VAPID keys (created by the dashboard on first use; service role only).
create table public.push_config (
  id          integer primary key default 1 check (id = 1),
  public_key  text not null,
  private_jwk jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- Server only: take the notifications waiting to be pushed (marks them so each goes once).
create or replace function public.claim_push_notifications()
returns table (id uuid, user_id uuid, kind text, title text, body text, link text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  with picked as (
    select n.id from public.notifications n
    where n.pushed_at is null and n.read_at is null and n.created_at > now() - interval '15 minutes'
      and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
    order by n.created_at
    limit 200
    for update skip locked
  )
  update public.notifications n set pushed_at = now()
  from picked where n.id = picked.id
  returning n.id, n.user_id, n.kind::text, n.title, n.body, n.link, n.created_at;
$$;
revoke execute on function public.claim_push_notifications() from public, anon, authenticated;
grant execute on function public.claim_push_notifications() to service_role;

create extension if not exists pg_net with schema extensions;

-- Every minute: if something is waiting for a device, ask the dashboard to send it.
create or replace function private.request_push_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notifications n
             where n.pushed_at is null and n.read_at is null and n.created_at > now() - interval '15 minutes'
               and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)) then
    perform net.http_post(
      url := 'https://phantomire-workforce.vercel.app/api/push/dispatch',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 20000);
  end if;
end $$;
revoke execute on function private.request_push_dispatch() from public, anon, authenticated;

select cron.schedule('clock-reminders', '*/5 * * * *', 'select private.clock_reminders()');
select cron.schedule('push-dispatch', '* * * * *', 'select private.request_push_dispatch()');

-- 3 -------------------------------------------------------------------
create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null default auth.uid(),
  title           text not null default '' check (char_length(title) <= 120),
  body            text not null default '' check (char_length(body) <= 5000),
  color           text not null default 'yellow' check (color in ('yellow', 'pink', 'green', 'blue', 'purple', 'orange')),
  pinned          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index notes_user_idx on public.notes (organization_id, user_id, pinned desc, updated_at desc);

create or replace function private.guard_note()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := private.current_org_id();
    new.user_id := auth.uid();
    new.created_at := now();
  else
    new.organization_id := old.organization_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger notes_guard before insert or update on public.notes
  for each row execute function private.guard_note();

alter table public.notes enable row level security;
create policy "own notes: read" on public.notes
  for select to authenticated using (user_id = (select auth.uid()) and organization_id = (select private.current_org_id()));
create policy "own notes: add" on public.notes
  for insert to authenticated with check (user_id = (select auth.uid()) and organization_id = (select private.current_org_id()));
create policy "own notes: change" on public.notes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own notes: remove" on public.notes
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notes from anon, authenticated;
grant select, delete on public.notes to authenticated;
grant insert (title, body, color, pinned), update (title, body, color, pinned) on public.notes to authenticated;
