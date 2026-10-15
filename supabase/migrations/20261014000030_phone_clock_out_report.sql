-- Clocking out on the phone works like the desktop app: "What did you get done?" (a daily
-- report, optional) and tick the tasks you finished, then clock out, all in one step.

create or replace function public.phone_clock_out(
  p_summary text default null, p_done_tasks uuid[] default '{}',
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  me   record;
  s    public.work_sessions;
  res  jsonb;
  done integer := 0;
begin
  select * into me from private.require_active_member();
  select * into s from public.work_sessions
  where user_id = uid and ended_at is null and source = 'phone'
  order by started_at desc limit 1;
  if not found then
    -- Let phone_clock explain (not clocked in, or clocked in on the computer).
    return public.phone_clock('out', p_lat, p_lng, p_accuracy);
  end if;

  -- Tasks finished: only your own open tasks; the task rules (guard_task) still apply.
  if coalesce(cardinality(p_done_tasks), 0) > 0 then
    update public.tasks set status = 'done'
    where id = any (p_done_tasks[1:50]) and assignee_id = uid and organization_id = me.organization_id and status <> 'done';
    get diagnostics done = row_count;
  end if;

  -- The report goes on the day the session started, in the person's own time zone.
  if char_length(trim(coalesce(p_summary, ''))) > 0 then
    insert into public.daily_reports (id, organization_id, user_id, session_id, work_date, summary)
    values (gen_random_uuid(), me.organization_id, uid, s.id, (s.started_at at time zone me.timezone)::date,
            left(trim(p_summary), 5000));
  end if;

  res := public.phone_clock('out', p_lat, p_lng, p_accuracy);
  return res || jsonb_build_object('tasks_done', done, 'report', char_length(trim(coalesce(p_summary, ''))) > 0);
end $$;

revoke execute on function public.phone_clock_out(text, uuid[], double precision, double precision, double precision) from public, anon;
grant execute on function public.phone_clock_out(text, uuid[], double precision, double precision, double precision) to authenticated;
