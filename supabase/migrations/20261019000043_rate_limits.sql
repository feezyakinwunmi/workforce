-- Speed limits against bots and abuse. Every signed-in person can only create so many rows per
-- minute/hour in the tables a bot would use to flood the database (chat, tasks, meetings…). The
-- counters are one row per person per limit (reset in place when the window passes), so this
-- table stays small and never needs cleaning. Rows written by the system (no signed-in user:
-- triggers, cron jobs, the service role) are never limited.
-- Book bookings: only our server may create them now (after a human check, see app/book), so a
-- bot can't call book_create directly with the public key to hold every free slot.

create table if not exists private.rate_counters (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

-- Count one hit for p_key; refuse when there have been more than p_max in the current window.
create or replace function private.rate_limit(p_key text, p_max integer, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into private.rate_counters as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into v;
  if v > p_max then
    raise exception 'You''re going too fast. Please wait a moment and try again.' using errcode = '54000';
  end if;
end $$;

-- Trigger version: rate_guard('<bucket>', '<max>', '<seconds>') on BEFORE INSERT.
create or replace function private.rate_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return new; end if;  -- system writes are never limited
  perform private.rate_limit(TG_ARGV[0] || ':' || v_uid::text, TG_ARGV[1]::integer, make_interval(secs => TG_ARGV[2]::integer));
  return new;
end $$;

-- For server routes (e.g. the Meet media route): limit the signed-in caller on a named bucket.
-- Only buckets listed here exist, so nobody can invent limits for others; calling it only ever
-- limits yourself.
create or replace function public.rate_check(p_bucket text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  case p_bucket
    when 'meet_media' then perform private.rate_limit('meet_media:' || v_uid::text, 150, interval '5 minutes');
    else raise exception 'Unknown limit' using errcode = '22023';
  end case;
end $$;

revoke execute on function private.rate_limit(text, integer, interval), private.rate_guard() from public, anon, authenticated;
revoke execute on function public.rate_check(text) from public, anon;
grant execute on function public.rate_check(text) to authenticated;
revoke all on private.rate_counters from public, anon, authenticated;

-- The limits (per person). Generous for real people, far below what a bot needs to hurt us.
create trigger rate_organizations   before insert on public.organizations      for each row execute function private.rate_guard('organizations', '5', '86400');
create trigger rate_invitations     before insert on public.invitations        for each row execute function private.rate_guard('invitations', '100', '3600');
create trigger rate_messages        before insert on public.messages           for each row execute function private.rate_guard('messages', '40', '60');
create trigger rate_channels        before insert on public.channels           for each row execute function private.rate_guard('channels', '30', '3600');
create trigger rate_tasks           before insert on public.tasks              for each row execute function private.rate_guard('tasks', '150', '3600');
create trigger rate_task_comments   before insert on public.task_comments      for each row execute function private.rate_guard('task_comments', '40', '600');
create trigger rate_projects        before insert on public.projects           for each row execute function private.rate_guard('projects', '30', '3600');
create trigger rate_notes           before insert on public.notes              for each row execute function private.rate_guard('notes', '60', '3600');
create trigger rate_expense_claims  before insert on public.expense_claims     for each row execute function private.rate_guard('expense_claims', '40', '3600');
create trigger rate_leave_requests  before insert on public.leave_requests     for each row execute function private.rate_guard('leave_requests', '20', '3600');
create trigger rate_goals           before insert on public.goals              for each row execute function private.rate_guard('goals', '60', '3600');
create trigger rate_staff_documents before insert on public.staff_documents    for each row execute function private.rate_guard('staff_documents', '40', '3600');
create trigger rate_push_subs       before insert on public.push_subscriptions for each row execute function private.rate_guard('push_subscriptions', '20', '3600');
create trigger rate_meet_rooms      before insert on public.meet_rooms         for each row execute function private.rate_guard('meet_rooms', '40', '3600');
create trigger rate_meet_chat       before insert on public.meet_events        for each row when (new.kind = 'chat') execute function private.rate_guard('meet_chat', '20', '10');
create trigger rate_book_services   before insert on public.book_services      for each row execute function private.rate_guard('book_services', '50', '3600');

-- Book: bookings only through our server (it checks the visitor is human first).
revoke execute on function public.book_create(text, uuid, timestamptz, text, text, text, text) from anon, authenticated;
grant execute on function public.book_create(text, uuid, timestamptz, text, text, text, text) to service_role;
