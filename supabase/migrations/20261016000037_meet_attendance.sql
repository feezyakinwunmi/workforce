-- Workbase Meet: attendance report (who came, when, how long).
--
-- Nothing new is stored apart from three small numbers per person in the meeting:
-- first time they got in, total seconds inside and how many times they joined.
-- The report is built on the spot by meet_attendance() and downloaded as a file;
-- it disappears with the meeting itself (deleted 7 days after it ends, see 0035).

alter table public.meet_participants
  add column if not exists first_joined_at timestamptz,
  add column if not exists seconds_in integer not null default 0 check (seconds_in >= 0),
  add column if not exists visits smallint not null default 0 check (visits >= 0);

-- Count time whenever someone gets in or out. Leaving is credited up to the last
-- heartbeat (+15 s), so people dropped by the clean-up job aren't given extra minutes.
create or replace function private.meet_count_time()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_seen timestamptz;
  v_end  timestamptz;
begin
  if new.status = 'admitted' and (tg_op = 'INSERT' or old.status is distinct from 'admitted') then
    new.first_joined_at := coalesce(new.first_joined_at, new.joined_at);
    new.visits := least(new.visits + 1, 30000);
  elsif tg_op = 'UPDATE' and old.status = 'admitted' and new.status <> 'admitted' then
    select s.last_seen_at into v_seen from public.meet_presence s where s.participant_id = old.id;
    v_end := least(coalesce(new.left_at, now()), coalesce(v_seen + interval '15 seconds', 'infinity'::timestamptz));
    if v_end > old.joined_at then
      new.seconds_in := least(new.seconds_in + floor(extract(epoch from v_end - old.joined_at))::int, 2000000000);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists meet_participants_count_time on public.meet_participants;
create trigger meet_participants_count_time before insert or update of status on public.meet_participants
  for each row execute function private.meet_count_time();

revoke execute on function private.meet_count_time() from public, anon, authenticated;

-- Meetings that already happened: one visit each, from what we have.
update public.meet_participants
set first_joined_at = coalesce(admitted_at, joined_at),
    visits = 1,
    seconds_in = case when status <> 'admitted' and left_at > joined_at
                      then floor(extract(epoch from left_at - joined_at))::int else 0 end
where admitted_at is not null and first_joined_at is null;

-- The report. The host (any time while the meeting is kept) and anyone who was in the
-- meeting can get it. Only the host also sees people who never got in.
create or replace function public.meet_attendance(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.meet_rooms;
  v_host boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.meet_rooms where code = lower(trim(p_code));
  if not found then raise exception 'Meeting not found.' using errcode = 'P0002'; end if;
  v_host := r.host_id = auth.uid();
  if not v_host and not exists (select 1 from public.meet_participants p
                                where p.room_id = r.id and p.user_id = auth.uid() and p.first_joined_at is not null) then
    raise exception 'Only people who were in this meeting can download who attended.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'title', r.title,
    'code', r.code,
    'host_name', coalesce(nullif((select full_name from public.profiles where id = r.host_id), ''), 'Host'),
    'starts_at', r.starts_at,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.display_name,
               'guest', x.is_guest,
               'role', x.role,
               'status', x.status,
               'first_joined', x.first_joined_at,
               'last_left', case when x.status = 'admitted' or x.first_joined_at is null then null else x.left_at end,
               'seconds', x.seconds_in + x.running,
               'visits', x.visits)
             order by x.first_joined_at nulls last, x.display_name)
      from (
        select p.*,
               case when p.status = 'admitted' then
                 greatest(0, floor(extract(epoch from
                   least(now(), coalesce(r.ended_at, now()), coalesce(s.last_seen_at + interval '15 seconds', now())) - p.joined_at)))::int
               else 0 end as running
        from public.meet_participants p
        left join public.meet_presence s on s.participant_id = p.id
        where p.room_id = r.id and (v_host or p.first_joined_at is not null)
      ) x), '[]'::jsonb)
  );
end $$;

revoke execute on function public.meet_attendance(text) from public, anon;
grant execute on function public.meet_attendance(text) to authenticated;
