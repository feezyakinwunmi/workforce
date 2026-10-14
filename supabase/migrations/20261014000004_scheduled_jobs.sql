-- Background jobs (pg_cron, Supabase only):
--   every 10 min: close sessions whose agent stopped reporting for 30+ minutes
--                 (laptop died, app killed). If the agent was only offline, its
--                 next upload reopens the session automatically (see ingest_batch).
--   nightly:      forget batch ids older than 30 days.
create extension if not exists pg_cron;

create or replace function private.close_lost_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.work_sessions w
  set ended_at = least(now(), greatest(
        w.started_at,
        coalesce(w.last_heartbeat_at, w.started_at),
        coalesce((select max(b.block_start) + interval '10 minutes'
                  from public.activity_blocks b where b.session_id = w.id), w.started_at))),
      end_reason = 'agent_lost'
  where w.ended_at is null
    and coalesce(w.last_heartbeat_at, w.started_at) < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function private.close_lost_sessions() from public, anon, authenticated;

select cron.schedule('close-lost-sessions', '*/10 * * * *', 'select private.close_lost_sessions()');
select cron.schedule('forget-old-batches', '15 3 * * *',
  $$delete from public.ingested_batches where received_at < now() - interval '30 days'$$);
