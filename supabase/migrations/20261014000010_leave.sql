-- Leave and public holidays.
--
-- leave_types     per company (defaults: Annual 20 days, Sick 10 days, Unpaid); admins edit
-- holidays        per company public holidays (admins add; a Nigerian preset is offered in the UI)
-- leave_requests  a worker asks for dates; days = weekdays in the range minus holidays.
--                 Managers/admins who can see the worker approve or reject (never their own,
--                 except the owner). The worker can cancel while pending, or before it starts.
-- Status changes only through decide_leave() / cancel_leave().

create table public.leave_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 40),
  color           text not null default 'violet'
                  check (color in ('violet', 'blue', 'green', 'amber', 'red', 'pink', 'slate')),
  days_per_year   numeric(5, 1) check (days_per_year between 0 and 365),  -- null = no limit
  paid            boolean not null default true,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index leave_types_name_unique on public.leave_types (organization_id, lower(name));

create table public.holidays (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  day             date not null,
  name            text not null check (char_length(trim(name)) between 1 and 80),
  created_at      timestamptz not null default now(),
  unique (organization_id, day)
);

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null default auth.uid(),
  leave_type_id   uuid not null,
  start_date      date not null,
  end_date        date not null,
  days            numeric(5, 1) not null default 0,
  reason          text check (char_length(reason) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text check (char_length(decision_note) <= 300),
  created_at      timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 366),
  foreign key (organization_id, leave_type_id) references public.leave_types (organization_id, id),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index leave_requests_org_dates_idx on public.leave_requests (organization_id, start_date, end_date);
create index leave_requests_user_idx on public.leave_requests (user_id, start_date);
create index leave_requests_type_idx on public.leave_requests (organization_id, leave_type_id);
create index leave_requests_decided_by_idx on public.leave_requests (decided_by);

-- ---------------------------------------------------------------------
-- Days off between two dates: weekdays (Mon-Fri) that are not company holidays.
-- ---------------------------------------------------------------------
create or replace function private.leave_days(p_org uuid, p_start date, p_end date)
returns numeric language sql stable security definer set search_path = '' as $$
  select count(*)::numeric
  from generate_series(p_start, p_end, interval '1 day') as g(d)
  where extract(isodow from g.d) < 6
    and not exists (select 1 from public.holidays h where h.organization_id = p_org and h.day = g.d::date);
$$;

-- Default leave types for every company (existing ones too).
create or replace function private.ensure_leave_types(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.leave_types (organization_id, name, color, days_per_year, paid)
  select p_org, t.name, t.color, t.days, t.paid
  from (values ('Annual leave', 'green', 20.0, true),
               ('Sick leave', 'amber', 10.0, true),
               ('Unpaid leave', 'slate', null::numeric, false)) as t(name, color, days, paid)
  where not exists (select 1 from public.leave_types lt where lt.organization_id = p_org);
$$;

create or replace function private.on_organization_created_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_leave_types(new.id);
  return null;
end $$;

create trigger organizations_default_leave_types after insert on public.organizations
  for each row execute function private.on_organization_created_leave();

select private.ensure_leave_types(id) from public.organizations;

-- ---------------------------------------------------------------------
-- New request: the server fills in who, the company, the day count and the status.
-- ---------------------------------------------------------------------
create or replace function private.prepare_leave_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lt public.leave_types;
begin
  new.organization_id := private.current_org_id();
  new.user_id := auth.uid();
  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  new.created_at := now();
  new.reason := nullif(trim(coalesce(new.reason, '')), '');

  select * into lt from public.leave_types
  where id = new.leave_type_id and organization_id = new.organization_id;
  if not found or lt.archived_at is not null then
    raise exception 'Pick a leave type' using errcode = '22023';
  end if;
  if new.end_date < new.start_date then
    raise exception 'The last day is before the first day' using errcode = '22023';
  end if;
  if new.start_date < current_date - 60 then
    raise exception 'Leave can only be requested up to 60 days back' using errcode = '22023';
  end if;

  new.days := private.leave_days(new.organization_id, new.start_date, new.end_date);
  if new.days = 0 then
    raise exception 'Those dates are all weekends or public holidays' using errcode = '22023';
  end if;

  if exists (select 1 from public.leave_requests r
             where r.user_id = new.user_id and r.status in ('pending', 'approved')
               and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'You already have leave booked on some of these days' using errcode = '23P01';
  end if;
  return new;
end $$;

create trigger leave_requests_prepare before insert on public.leave_requests
  for each row execute function private.prepare_leave_request();

alter type public.notification_kind add value if not exists 'leave_requested';
alter type public.notification_kind add value if not exists 'leave_decided';

-- Tell the people who can approve: owner/admins and the manager of the person's team.
create or replace function private.after_leave_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who  text := coalesce(private.person_name(new.user_id), 'Someone');
  what text;
  r    record;
begin
  select name into what from public.leave_types where id = new.leave_type_id;
  for r in
    select distinct m.user_id
    from public.memberships m
    where m.organization_id = new.organization_id and m.status = 'active' and m.user_id <> new.user_id
      and (m.role in ('owner', 'admin')
           or m.user_id = (select t.manager_id from public.memberships me
                           join public.teams t on t.id = me.team_id
                           where me.organization_id = new.organization_id and me.user_id = new.user_id))
  loop
    perform private.notify(new.organization_id, r.user_id, 'leave_requested',
      who || ' asked for ' || lower(coalesce(what, 'leave')),
      to_char(new.start_date, 'FMDD Mon') ||
        case when new.end_date <> new.start_date then ' to ' || to_char(new.end_date, 'FMDD Mon') else '' end ||
        ' (' || trim(to_char(new.days, 'FM990.9')) || case when new.days = 1 then ' day)' else ' days)' end,
      '/dashboard/leave', null, new.user_id);
  end loop;
  return null;
end $$;

create trigger leave_requests_notify after insert on public.leave_requests
  for each row execute function private.after_leave_request();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.leave_requests;
begin
  select * into req from public.leave_requests
  where id = p_id and organization_id = private.current_org_id() for update;
  if not found then
    raise exception 'Leave request not found' using errcode = '22023';
  end if;
  if not private.is_manager_or_admin() or not (req.user_id = any (private.visible_member_ids())) then
    raise exception 'Only this person''s manager or an admin can decide' using errcode = '42501';
  end if;
  if req.user_id = auth.uid() and private.current_member_role() <> 'owner' then
    raise exception 'Someone else has to approve your own leave' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request was already %', req.status using errcode = '22023';
  end if;

  update public.leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(),
      decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
  where id = req.id;

  perform private.notify(req.organization_id, req.user_id, 'leave_decided',
    'Your leave from ' || to_char(req.start_date, 'FMDD Mon') || ' was ' ||
      case when p_approve then 'approved' else 'not approved' end,
    nullif(trim(coalesce(p_note, '')), ''), '/dashboard/leave', null, auth.uid());
end $$;

create or replace function public.cancel_leave(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.leave_requests;
begin
  select * into req from public.leave_requests where id = p_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Leave request not found' using errcode = '22023';
  end if;
  if req.status = 'pending' or (req.status = 'approved' and req.start_date > current_date) then
    update public.leave_requests set status = 'cancelled' where id = req.id;
  else
    raise exception 'Leave that has started or finished can''t be cancelled. Ask your manager.' using errcode = '22023';
  end if;
end $$;

-- Allowance, used and pending days per leave type for one person and year.
create or replace function public.leave_balances(p_user uuid default null, p_year integer default null)
returns table (leave_type_id uuid, name text, color text, paid boolean,
               allowance numeric, used numeric, pending numeric)
language sql stable security definer set search_path = '' as $$
  select lt.id, lt.name, lt.color, lt.paid, lt.days_per_year,
         coalesce(sum(r.days) filter (where r.status = 'approved'), 0),
         coalesce(sum(r.days) filter (where r.status = 'pending'), 0)
  from public.leave_types lt
  left join public.leave_requests r
    on r.leave_type_id = lt.id and r.user_id = coalesce(p_user, auth.uid())
   and extract(year from r.start_date) = coalesce(p_year, extract(year from current_date))
  where lt.organization_id = private.current_org_id()
    and lt.archived_at is null
    and (coalesce(p_user, auth.uid()) = auth.uid()
         or coalesce(p_user, auth.uid()) = any (private.visible_member_ids()))
  group by lt.id
  order by lt.created_at;
$$;

-- ---------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------
alter table public.leave_types    enable row level security;
alter table public.holidays       enable row level security;
alter table public.leave_requests enable row level security;

create policy "members read leave types" on public.leave_types
  for select to authenticated using (organization_id = (select private.current_org_id()));
create policy "admins add leave types" on public.leave_types
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins edit leave types" on public.leave_types
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

create policy "members read holidays" on public.holidays
  for select to authenticated using (organization_id = (select private.current_org_id()));
create policy "admins add holidays" on public.holidays
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins remove holidays" on public.holidays
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

create policy "see own and visible members' leave" on public.leave_requests
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or user_id = any ((select private.visible_member_ids())::uuid[])));
create policy "request own leave" on public.leave_requests
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and user_id = (select auth.uid()));

revoke all on public.leave_types, public.holidays, public.leave_requests from anon, authenticated;
grant select on public.leave_types, public.holidays, public.leave_requests to authenticated;
grant insert (name, color, days_per_year, paid), update (name, color, days_per_year, paid, archived_at)
  on public.leave_types to authenticated;
grant insert (day, name), delete on public.holidays to authenticated;
grant insert (leave_type_id, start_date, end_date, reason) on public.leave_requests to authenticated;

revoke execute on function private.leave_days(uuid, date, date) from public, anon, authenticated;
revoke execute on function private.ensure_leave_types(uuid) from public, anon, authenticated;
revoke execute on function public.decide_leave(uuid, boolean, text), public.cancel_leave(uuid),
                           public.leave_balances(uuid, integer) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text), public.cancel_leave(uuid),
                          public.leave_balances(uuid, integer) to authenticated;
