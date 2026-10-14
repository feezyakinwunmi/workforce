-- =====================================================================
-- Phase 3 · Tasks: projects, tasks, comments, time per task, end-of-
-- session reports. Time per task and reports arrive from the desktop
-- agent through ingest_batch (extended here; older agents keep working).
--
-- Who can do what
--   everyone in the company: see projects and tasks, create tasks
--     (for themselves or unassigned), comment
--   assignee:   change the status of their task
--   creator:    edit their own task (assign only to themselves)
--   manager / admin / owner: everything, including projects
-- =====================================================================

create type public.task_status   as enum ('todo', 'in_progress', 'review', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create or replace function private.is_manager_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_member_role() in ('owner', 'admin', 'manager'), false);
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                    references public.organizations (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 80),
  description     text check (char_length(description) <= 1000),
  color           text not null default 'violet'
                    check (color in ('violet', 'blue', 'green', 'amber', 'red', 'pink', 'slate')),
  archived_at     timestamptz,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);
create index projects_created_by_idx on public.projects (created_by);

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default private.current_org_id()
                     references public.organizations (id) on delete cascade,
  project_id       uuid,
  title            text not null check (char_length(trim(title)) between 1 and 200),
  description      text check (char_length(description) <= 5000),
  status           public.task_status   not null default 'todo',
  priority         public.task_priority not null default 'medium',
  assignee_id      uuid,
  due_date         date,
  estimate_minutes integer check (estimate_minutes between 0 and 100000),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete set null (project_id),
  foreign key (organization_id, assignee_id)
    references public.memberships (organization_id, user_id) on delete set null (assignee_id)
);
create index tasks_org_status_idx on public.tasks (organization_id, status);
create index tasks_org_project_idx on public.tasks (organization_id, project_id);
create index tasks_org_assignee_idx on public.tasks (organization_id, assignee_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_created_by_idx on public.tasks (created_by);

create table public.task_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                    references public.organizations (id) on delete cascade,
  task_id         uuid not null,
  author_id       uuid default auth.uid() references auth.users (id) on delete set null,
  body            text not null check (char_length(trim(body)) between 1 and 5000),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, task_id) references public.tasks (organization_id, id) on delete cascade
);
create index task_comments_task_idx on public.task_comments (organization_id, task_id, created_at);
create index task_comments_author_idx on public.task_comments (author_id);

-- Seconds worked on each task inside a 10-minute block (from the desktop agent).
create table public.task_time (
  session_id      uuid not null,
  block_start     timestamptz not null,
  task_id         uuid not null references public.tasks (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  seconds         integer not null check (seconds between 0 and 600),
  primary key (session_id, block_start, task_id),
  foreign key (session_id, block_start) references public.activity_blocks (session_id, block_start) on delete cascade
);
create index task_time_task_idx on public.task_time (task_id);
create index task_time_org_user_time_idx on public.task_time (organization_id, user_id, block_start);
create index task_time_user_idx on public.task_time (user_id);

-- "What I got done", written at clock-out. One per session (id from the agent).
create table public.daily_reports (
  id              uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  session_id      uuid references public.work_sessions (id) on delete set null,
  work_date       date not null,
  summary         text not null check (char_length(summary) between 1 and 5000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index daily_reports_org_user_date_idx on public.daily_reports (organization_id, user_id, work_date);
create index daily_reports_user_idx on public.daily_reports (user_id);
create index daily_reports_session_idx on public.daily_reports (session_id);

-- ---------------------------------------------------------------------
-- Task rules (who may change what) + bookkeeping
-- ---------------------------------------------------------------------
create or replace function private.guard_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor   uuid := auth.uid();
  manager boolean := private.is_manager_or_admin();
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  if actor is null or manager then
    return new;  -- SQL editor / service role, or a manager or admin
  end if;

  if tg_op = 'INSERT' then
    if new.assignee_id is not null and new.assignee_id <> actor then
      raise exception 'Only managers and admins can assign tasks to other people' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.created_by = actor then
    if new.assignee_id is distinct from old.assignee_id
       and new.assignee_id is not null and new.assignee_id <> actor then
      raise exception 'Only managers and admins can assign tasks to other people' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.assignee_id = actor then
    if (new.title, new.description, new.priority, new.assignee_id, new.due_date, new.estimate_minutes, new.project_id)
       is distinct from
       (old.title, old.description, old.priority, old.assignee_id, old.due_date, old.estimate_minutes, old.project_id) then
      raise exception 'You can only change the status of a task assigned to you' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'You cannot change this task' using errcode = '42501';
end $$;

create trigger tasks_guard before insert or update on public.tasks
  for each row execute function private.guard_task();

-- ---------------------------------------------------------------------
-- Desktop agent: the caller's open tasks
-- ---------------------------------------------------------------------
create or replace function public.my_open_tasks()
returns table (id uuid, title text, status public.task_status, priority public.task_priority,
               project_name text, due_date date)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.title, t.status, t.priority, p.name, t.due_date
  from public.tasks t
  left join public.projects p on p.organization_id = t.organization_id and p.id = t.project_id
  where t.assignee_id = auth.uid() and t.status <> 'done'
  order by (t.status = 'in_progress') desc, t.due_date nulls last, t.created_at desc
  limit 100;
$$;

-- Time logged per task (and per person) - for task pages and project totals.
create or replace function public.task_time_totals(p_task_ids uuid[])
returns table (task_id uuid, user_id uuid, seconds bigint)
language sql stable security invoker set search_path = '' as $$
  select tt.task_id, tt.user_id, sum(tt.seconds)::bigint
  from public.task_time tt
  where tt.task_id = any (p_task_ids)
  group by 1, 2;
$$;

-- ---------------------------------------------------------------------
-- ingest_batch, now also storing task time and reports
-- ---------------------------------------------------------------------
create or replace function public.ingest_batch(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  me         record;
  dev        public.devices;
  v_batch    uuid;
  v_sent     timestamptz;
  v_offset   integer;
  v_track    boolean;
  v_sessions jsonb := coalesce(p_payload -> 'sessions', '[]');
  v_blocks   jsonb := coalesce(p_payload -> 'blocks', '[]');
  v_apps     jsonb := coalesce(p_payload -> 'apps', '[]');
  v_idle     jsonb := coalesce(p_payload -> 'idle_periods', '[]');
  v_tasktime jsonb := coalesce(p_payload -> 'task_time', '[]');
  v_reports  jsonb := coalesce(p_payload -> 'reports', '[]');
begin
  select * into me from private.require_active_member();
  v_track := coalesce((me.settings ->> 'track_apps')::boolean, true);

  if jsonb_typeof(v_sessions) <> 'array' or jsonb_typeof(v_blocks) <> 'array'
     or jsonb_typeof(v_apps) <> 'array' or jsonb_typeof(v_idle) <> 'array'
     or jsonb_typeof(v_tasktime) <> 'array' or jsonb_typeof(v_reports) <> 'array' then
    raise exception 'Malformed batch' using errcode = '22023';
  end if;
  if jsonb_array_length(v_sessions) > 200 or jsonb_array_length(v_blocks) > 2000
     or jsonb_array_length(v_apps) > 10000 or jsonb_array_length(v_idle) > 500
     or jsonb_array_length(v_tasktime) > 5000 or jsonb_array_length(v_reports) > 50 then
    raise exception 'Batch too large' using errcode = '54000';
  end if;

  select * into dev from public.devices
  where id = (p_payload ->> 'device_id')::uuid and user_id = uid;
  if not found then
    raise exception 'This computer is not registered. Log in again in the app' using errcode = 'P0002';
  end if;
  if dev.revoked_at is not null then
    raise exception 'This computer was disconnected by your admin' using errcode = '42501';
  end if;

  v_batch  := (p_payload ->> 'batch_id')::uuid;
  v_sent   := coalesce((p_payload ->> 'sent_at')::timestamptz, now());
  v_offset := round(extract(epoch from now() - v_sent));

  insert into public.ingested_batches (id, device_id, user_id, clock_offset_seconds)
  values (v_batch, dev.id, uid, v_offset)
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'server_time', now());
  end if;

  update public.devices set last_seen_at = now(), clock_offset_seconds = v_offset where id = dev.id;

  -- Sessions must not belong to someone else.
  if exists (
    select 1 from jsonb_to_recordset(v_sessions) as s (id uuid)
    join public.work_sessions w on w.id = s.id
    where w.user_id <> uid
  ) then
    raise exception 'Session belongs to another user' using errcode = '42501';
  end if;

  -- A new clock-in closes any session this user left open elsewhere.
  update public.work_sessions w
  set ended_at = greatest(w.started_at, coalesce(w.last_heartbeat_at, w.started_at)),
      end_reason = 'superseded'
  where w.user_id = uid and w.ended_at is null
    and w.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(v_sessions) x)
    and exists (
      select 1 from jsonb_to_recordset(v_sessions) as s (id uuid, started_at timestamptz, ended_at timestamptz)
      where s.ended_at is null and s.started_at > w.started_at
        and not exists (select 1 from public.work_sessions e where e.id = s.id)
    );

  insert into public.work_sessions (id, organization_id, user_id, device_id, started_at, ended_at, end_reason)
  select s.id, me.organization_id, uid, dev.id, s.started_at, s.ended_at,
         case when s.ended_at is not null then coalesce(s.end_reason, 'clock_out') end
  from jsonb_to_recordset(v_sessions) as s (id uuid, started_at timestamptz, ended_at timestamptz, end_reason text)
  where s.started_at > now() - interval '35 days' and s.started_at < now() + interval '10 minutes'
  on conflict (id) do update
    set ended_at = coalesce(excluded.ended_at,
                            case when public.work_sessions.end_reason = 'agent_lost' then null
                                 else public.work_sessions.ended_at end),
        end_reason = case
                       when excluded.ended_at is not null then excluded.end_reason
                       when public.work_sessions.end_reason = 'agent_lost' then null
                       else public.work_sessions.end_reason
                     end
    where public.work_sessions.user_id = uid;

  insert into public.activity_blocks (session_id, block_start, organization_id, user_id,
                                      active_seconds, idle_seconds, excluded_seconds, updated_at)
  select b.session_id, b.block_start, me.organization_id, uid,
         least(greatest(coalesce(b.active, 0), 0), 600),
         least(greatest(coalesce(b.idle, 0), 0), 600),
         least(greatest(coalesce(b.discarded, 0), 0), 600),
         now()
  from jsonb_to_recordset(v_blocks) as b (session_id uuid, block_start timestamptz, active int, idle int, discarded int)
  join public.work_sessions w on w.id = b.session_id and w.user_id = uid
  where extract(epoch from b.block_start)::bigint % 600 = 0
  on conflict (session_id, block_start) do update
    set active_seconds = excluded.active_seconds,
        idle_seconds = excluded.idle_seconds,
        excluded_seconds = excluded.excluded_seconds,
        updated_at = now();

  if v_track then
    insert into public.app_usage (session_id, block_start, organization_id, user_id, app_name, window_title, seconds)
    select a.session_id, a.block_start, me.organization_id, uid,
           left(a.app, 120), left(coalesce(a.title, ''), 300), least(greatest(a.seconds, 0), 600)
    from jsonb_to_recordset(v_apps) as a (session_id uuid, block_start timestamptz, app text, title text, seconds int)
    join public.activity_blocks ab on ab.session_id = a.session_id and ab.block_start = a.block_start and ab.user_id = uid
    where coalesce(a.app, '') <> ''
    on conflict (session_id, block_start, app_name, window_title) do update
      set seconds = excluded.seconds;
  end if;

  insert into public.idle_periods (id, session_id, organization_id, user_id, started_at, ended_at, decision, reason)
  select i.id, i.session_id, me.organization_id, uid, i.started_at, i.ended_at,
         case when i.decision in ('pending', 'kept', 'discarded') then i.decision else 'pending' end,
         left(i.reason, 200)
  from jsonb_to_recordset(v_idle) as i (id uuid, session_id uuid, started_at timestamptz, ended_at timestamptz, decision text, reason text)
  join public.work_sessions w on w.id = i.session_id and w.user_id = uid
  on conflict (id) do update
    set ended_at = excluded.ended_at, decision = excluded.decision, reason = excluded.reason
    where public.idle_periods.user_id = uid;

  -- Time per task (agent 0.2+). Only tasks of the caller's own company.
  insert into public.task_time (session_id, block_start, task_id, organization_id, user_id, seconds)
  select t.session_id, t.block_start, t.task_id, me.organization_id, uid, least(greatest(t.seconds, 0), 600)
  from jsonb_to_recordset(v_tasktime) as t (session_id uuid, block_start timestamptz, task_id uuid, seconds int)
  join public.activity_blocks ab on ab.session_id = t.session_id and ab.block_start = t.block_start and ab.user_id = uid
  join public.tasks k on k.id = t.task_id and k.organization_id = me.organization_id
  on conflict (session_id, block_start, task_id) do update
    set seconds = excluded.seconds;

  -- End-of-session reports ("what I did today").
  insert into public.daily_reports (id, organization_id, user_id, session_id, work_date, summary)
  select r.id, me.organization_id, uid,
         (select w.id from public.work_sessions w where w.id = r.session_id and w.user_id = uid),
         r.work_date, left(r.summary, 5000)
  from jsonb_to_recordset(v_reports) as r (id uuid, session_id uuid, work_date date, summary text)
  where coalesce(trim(r.summary), '') <> ''
    and r.work_date between current_date - 35 and current_date + 1
  on conflict (id) do update
    set summary = excluded.summary, updated_at = now()
    where public.daily_reports.user_id = uid;

  return jsonb_build_object('ok', true, 'server_time', now());
end $$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.projects      enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_time     enable row level security;
alter table public.daily_reports enable row level security;

create policy "members read projects" on public.projects
  for select to authenticated using (organization_id = (select private.current_org_id()));
create policy "managers create projects" on public.projects
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_manager_or_admin()));
create policy "managers update projects" on public.projects
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_manager_or_admin()))
  with check (organization_id = (select private.current_org_id()));

create policy "members read tasks" on public.tasks
  for select to authenticated using (organization_id = (select private.current_org_id()));
create policy "members create tasks" on public.tasks
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and created_by = (select auth.uid()));
create policy "assignee, creator or manager updates tasks" on public.tasks
  for update to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_manager_or_admin())
              or assignee_id = (select auth.uid())
              or created_by = (select auth.uid())))
  with check (organization_id = (select private.current_org_id()));
create policy "creator or manager deletes tasks" on public.tasks
  for delete to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_manager_or_admin()) or created_by = (select auth.uid())));

create policy "members read comments" on public.task_comments
  for select to authenticated using (organization_id = (select private.current_org_id()));
create policy "members comment" on public.task_comments
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and author_id = (select auth.uid()));
create policy "author or admin deletes comments" on public.task_comments
  for delete to authenticated
  using (organization_id = (select private.current_org_id())
         and (author_id = (select auth.uid()) or (select private.is_org_admin())));

create policy "see task time of visible members" on public.task_time
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));
create policy "see reports of visible members" on public.daily_reports
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));

-- Privileges: only the columns the app edits.
revoke all on public.projects, public.tasks, public.task_comments, public.task_time, public.daily_reports
  from anon, authenticated;
grant select on public.projects, public.tasks, public.task_comments, public.task_time, public.daily_reports
  to authenticated;
grant insert (name, description, color), update (name, description, color, archived_at)
  on public.projects to authenticated;
grant insert (project_id, title, description, status, priority, assignee_id, due_date, estimate_minutes),
      update (project_id, title, description, status, priority, assignee_id, due_date, estimate_minutes),
      delete
  on public.tasks to authenticated;
grant insert (task_id, body), delete on public.task_comments to authenticated;

revoke execute on function private.is_manager_or_admin() from public, anon;
grant execute on function private.is_manager_or_admin() to authenticated;
revoke execute on function public.my_open_tasks() from public, anon;
revoke execute on function public.task_time_totals(uuid[]) from public, anon;
grant execute on function public.my_open_tasks() to authenticated;
grant execute on function public.task_time_totals(uuid[]) to authenticated;
