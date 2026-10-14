-- Pilot readiness: in-app notifications, ownership transfer, fuller audit of member changes.
--
-- Notifications are written only by database triggers and jobs (never by the browser or the
-- desktop app). Each person reads and marks their own. The desktop app shows new ones as
-- Windows pop-ups; the dashboard shows them under the bell.

create type public.notification_kind as enum ('task_assigned', 'task_comment', 'task_done', 'task_due');

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            public.notification_kind not null,
  title           text not null check (char_length(title) between 1 and 300),
  body            text check (char_length(body) <= 500),
  link            text check (link like '/%'),
  task_id         uuid references public.tasks (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  ref_date        date, -- due reminders: the due date reminded about (one reminder per due date)
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_org_idx          on public.notifications (organization_id);
create index notifications_task_idx         on public.notifications (task_id);
create index notifications_actor_idx        on public.notifications (actor_id);
create unique index notifications_due_once  on public.notifications (task_id, user_id, ref_date)
  where kind = 'task_due';

-- Display name of a user, for notification text.
create or replace function private.person_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Someone') from public.profiles p where p.id = p_user;
$$;

-- Add one notification, unless it would go to the person who caused it or to a non-member.
create or replace function private.notify(
  p_org uuid, p_user uuid, p_kind public.notification_kind, p_title text,
  p_body text, p_link text, p_task uuid, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user is not distinct from p_actor then
    return;
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = p_user and m.status = 'active'
  ) then
    return;
  end if;
  insert into public.notifications (organization_id, user_id, kind, title, body, link, task_id, actor_id)
  values (p_org, p_user, p_kind, left(p_title, 300), left(p_body, 500), p_link, p_task, p_actor);
end $$;

-- Task assigned to someone, or finished.
create or replace function private.notify_task_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  who   text := coalesce(private.person_name(auth.uid()), 'Someone');
  link  text := '/dashboard/tasks/' || new.id;
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.status <> 'done' then
    perform private.notify(
      new.organization_id, new.assignee_id, 'task_assigned',
      who || ' assigned you a task',
      new.title || coalesce(' · due ' || to_char(new.due_date, 'FMDD Mon'), ''),
      link, new.id, actor);
  end if;

  if tg_op = 'UPDATE' and new.status = 'done' and old.status <> 'done' then
    perform private.notify(
      new.organization_id, new.created_by, 'task_done',
      who || ' finished a task', new.title, link, new.id, actor);
  end if;
  return null;
end $$;

create trigger tasks_notify after insert or update of assignee_id, status on public.tasks
  for each row execute function private.notify_task_change();

-- New comment: tell the assignee and the creator (not the author).
create or replace function private.notify_task_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t   record;
  who text := coalesce(private.person_name(new.author_id), 'Someone');
begin
  select id, title, assignee_id, created_by into t from public.tasks where id = new.task_id;
  if not found then
    return null;
  end if;
  perform private.notify(new.organization_id, t.assignee_id, 'task_comment',
    who || ' commented on "' || left(t.title, 120) || '"', new.body,
    '/dashboard/tasks/' || t.id, t.id, new.author_id);
  if t.created_by is distinct from t.assignee_id then
    perform private.notify(new.organization_id, t.created_by, 'task_comment',
      who || ' commented on "' || left(t.title, 120) || '"', new.body,
      '/dashboard/tasks/' || t.id, t.id, new.author_id);
  end if;
  return null;
end $$;

create trigger task_comments_notify after insert on public.task_comments
  for each row execute function private.notify_task_comment();

-- Hourly job: "due tomorrow" reminders, sent from 08:00 in each worker's own time zone.
create or replace function private.notify_due_tasks()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.notifications (organization_id, user_id, kind, title, body, link, task_id, ref_date)
  select t.organization_id, t.assignee_id, 'task_due', 'Due tomorrow: ' || left(t.title, 280),
         'Task due ' || to_char(t.due_date, 'FMDay DD Mon') || '.',
         '/dashboard/tasks/' || t.id, t.id, t.due_date
  from public.tasks t
  join public.memberships m
    on m.organization_id = t.organization_id and m.user_id = t.assignee_id and m.status = 'active'
  where t.status <> 'done'
    and t.due_date = (now() at time zone m.timezone)::date + 1
    and extract(hour from now() at time zone m.timezone) >= 8
  on conflict (task_id, user_id, ref_date) where kind = 'task_due' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('task-due-reminders', '5 * * * *', 'select private.notify_due_tasks()');
select cron.schedule('forget-old-notifications', '25 3 * * *',
  $$delete from public.notifications where created_at < now() - interval '90 days'$$);

-- RLS: everyone reads and marks only their own notifications.
alter table public.notifications enable row level security;

create policy "read own notifications" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id = (select private.current_org_id()));
create policy "mark own notifications read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and organization_id = (select private.current_org_id()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;

revoke execute on function private.person_name(uuid) from public, anon, authenticated;
revoke execute on function private.notify(uuid, uuid, public.notification_kind, text, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.notify_due_tasks() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Ownership transfer: the owner hands the company to another active member
-- and becomes an admin. Logged in audit_logs.
-- ---------------------------------------------------------------------
create or replace function public.transfer_ownership(p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid;
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;

  select m.organization_id into v_org
  from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active' and m.role = 'owner';
  if v_org is null then
    raise exception 'Only the company owner can transfer ownership' using errcode = '42501';
  end if;
  if p_new_owner = auth.uid() then
    raise exception 'You already own this company' using errcode = '22023';
  end if;

  select m.id into v_target
  from public.memberships m
  where m.organization_id = v_org and m.user_id = p_new_owner and m.status = 'active';
  if v_target is null then
    raise exception 'That person is not an active member of your company' using errcode = '22023';
  end if;

  perform set_config('app.trusted_member_change', 'on', true);
  update public.memberships set role = 'admin' where organization_id = v_org and user_id = auth.uid();
  update public.memberships set role = 'owner' where id = v_target;
  perform set_config('app.trusted_member_change', 'off', true);

  perform private.log_audit(v_org, 'organization.ownership_transferred', 'membership', v_target,
    jsonb_build_object('from', auth.uid(), 'to', p_new_owner));
end $$;

revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;

-- Member audit now also records time zone, expected hours and job title changes
-- (only the fields that changed).
create or replace function private.audit_membership_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := '{}'::jsonb;
begin
  if new.role is distinct from old.role then
    d := d || jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.status is distinct from old.status then
    d := d || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.team_id is distinct from old.team_id then
    d := d || jsonb_build_object('team_id', jsonb_build_object('from', old.team_id, 'to', new.team_id));
  end if;
  if new.timezone is distinct from old.timezone then
    d := d || jsonb_build_object('timezone', jsonb_build_object('from', old.timezone, 'to', new.timezone));
  end if;
  if new.expected_hours_per_day is distinct from old.expected_hours_per_day then
    d := d || jsonb_build_object('expected_hours_per_day',
                jsonb_build_object('from', old.expected_hours_per_day, 'to', new.expected_hours_per_day));
  end if;
  if new.job_title is distinct from old.job_title then
    d := d || jsonb_build_object('job_title', jsonb_build_object('from', old.job_title, 'to', new.job_title));
  end if;
  if d <> '{}'::jsonb then
    perform private.log_audit(new.organization_id, 'member.updated', 'membership', new.id,
      jsonb_build_object('user_id', new.user_id) || d);
  end if;
  return new;
end $$;
