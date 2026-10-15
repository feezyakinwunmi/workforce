-- Workbase Meet keeps as little as possible:
--   * in-meeting chat, reactions and host commands are deleted the moment a meeting ends
--   * everything else about a meeting (who joined, invites) is deleted 7 days after it ended
--     (meetings that never started: 7 days after their planned time)
--   * guest logins (anonymous accounts) are deleted after 7 days
-- Payments (meet_subscriptions) are kept: they are receipts.

-- 1. A meeting ends (host ends it, time runs out, or everyone left): its chat goes at once.
create or replace function private.meet_forget_chat()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.meet_events where room_id = new.id;
  delete from public.meet_presence where room_id = new.id;
  return null;
end $$;

drop trigger if exists meet_rooms_forget_chat on public.meet_rooms;
create trigger meet_rooms_forget_chat after update of ended_at on public.meet_rooms
  for each row when (old.ended_at is null and new.ended_at is not null)
  execute function private.meet_forget_chat();

-- 2. The 5-minute clean-up job: same as before, with a 7-day memory.
create or replace function private.meet_housekeeping()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.meet_participants p set status = 'left', left_at = now(), tracks = '[]'::jsonb, sfu_session = null
  from public.meet_presence s
  where s.participant_id = p.id and p.status in ('admitted', 'waiting') and s.last_seen_at < now() - interval '2 minutes';

  with closed as (
    update public.meet_rooms r set ended_at = least(now(), coalesce(r.ends_at, now()))
    where r.ended_at is null and r.started_at is not null
      and (r.ends_at <= now()
           or (r.started_at < now() - interval '15 minutes' and not exists (
                 select 1 from public.meet_participants p join public.meet_presence s on s.participant_id = p.id
                 where p.room_id = r.id and p.status = 'admitted' and s.last_seen_at > now() - interval '15 minutes')))
    returning r.id
  )
  select count(*) into v_n from closed;

  -- Chat of ended meetings (normally already gone through the trigger above).
  delete from public.meet_events e using public.meet_rooms r where e.room_id = r.id and r.ended_at is not null;

  -- Meetings 7 days after they ended, or 7 days after a planned time that never happened.
  -- Participants, invites and presence go with them.
  delete from public.meet_rooms r
  where r.ended_at < now() - interval '7 days'
     or (r.started_at is null and coalesce(r.starts_at, r.created_at) < now() - interval '7 days');

  -- Guest logins older than 7 days that aren't in a meeting right now.
  begin
    delete from auth.users u
    where u.is_anonymous and u.created_at < now() - interval '7 days'
      and not exists (select 1 from public.meet_participants p join public.meet_rooms r on r.id = p.room_id
                      where p.user_id = u.id and r.ended_at is null);
  exception when others then
    raise warning 'meet_housekeeping: guest clean-up skipped: %', sqlerrm;
  end;
  return v_n;
end $$;

-- 3. "My meetings" shows upcoming ones and the last 7 days.
create or replace function public.meet_my_meetings()
returns table (id uuid, code text, title text, starts_at timestamptz, duration_minutes integer,
               started_at timestamptz, ended_at timestamptz, is_host boolean, host_name text, invites integer)
language sql stable security definer set search_path = '' as $$
  select r.id, r.code, r.title, r.starts_at, r.duration_minutes, r.started_at, r.ended_at, r.host_id = auth.uid(),
         coalesce(nullif(pr.full_name, ''), 'Host'),
         (select count(*)::int from public.meet_invites i where i.room_id = r.id)
  from public.meet_rooms r
  left join public.profiles pr on pr.id = r.host_id
  where (r.host_id = auth.uid()
         or exists (select 1 from public.meet_invites i where i.room_id = r.id
                    and i.email = (select email from public.profiles where id = auth.uid())))
    and (r.ended_at is null or r.ended_at > now() - interval '7 days')
  order by coalesce(r.starts_at, r.created_at) desc
  limit 100
$$;

revoke execute on function private.meet_forget_chat(), private.meet_housekeeping() from public, anon, authenticated;

-- Clean up what is already older than the new rules.
select private.meet_housekeeping();
