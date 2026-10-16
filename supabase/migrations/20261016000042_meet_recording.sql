-- Meet recording (free on every plan). The host or a co-host records on their own device: the
-- browser mixes everyone's video and sound and saves the file there. Nothing is uploaded or kept
-- by Workbase. The database only knows WHO is recording right now (recording_since), so everyone
-- in the call sees "Recording" (Realtime on meet_participants; the room shows the start/stop line
-- in the chat from that) and people are told before they join (meet_room_info.recording).

alter table public.meet_participants add column if not exists recording_since timestamptz;

-- Start or stop recording (host and co-hosts only). Returns when it started (null = stopped).
create or replace function public.meet_record(p_room uuid, p_on boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  me public.meet_participants;
  r public.meet_rooms;
begin
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid() and status = 'admitted';
  if not found then raise exception 'You are not in this meeting' using errcode = '42501'; end if;
  select * into r from public.meet_rooms where id = p_room;
  if r.ended_at is not null then raise exception 'This meeting has ended.' using errcode = '22023'; end if;
  if coalesce(p_on, false) then
    if me.role not in ('host', 'cohost') then
      raise exception 'Only the host or a co-host can record' using errcode = '42501';
    end if;
    if me.recording_since is null then
      update public.meet_participants set recording_since = now() where id = me.id returning * into me;
    end if;
  elsif me.recording_since is not null then
    update public.meet_participants set recording_since = null where id = me.id returning * into me;
  end if;
  return me.recording_since;
end $$;
revoke execute on function public.meet_record(uuid, boolean) from public, anon;
grant execute on function public.meet_record(uuid, boolean) to authenticated;

-- Leaving, being removed, the meeting ending or losing co-host: the "Recording" sign goes away.
create or replace function private.meet_recording_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.recording_since is not null and (new.status <> 'admitted' or new.role = 'member') then
    new.recording_since := null;
  end if;
  return new;
end $$;
revoke execute on function private.meet_recording_guard() from public, anon, authenticated;
create trigger meet_participants_recording before update of status, role on public.meet_participants
  for each row execute function private.meet_recording_guard();

-- The lobby says "This meeting is being recorded" before anyone joins.
create or replace function public.meet_room_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.meet_rooms;
  me public.meet_participants;
  v_tier text;
begin
  select * into r from public.meet_rooms where code = lower(trim(p_code));
  if not found then return null; end if;
  select * into me from public.meet_participants where room_id = r.id and user_id = auth.uid();
  v_tier := private.meet_tier(r.host_id);
  return jsonb_build_object(
    'id', r.id, 'code', r.code, 'title', r.title,
    'host_name', coalesce(nullif((select full_name from public.profiles where id = r.host_id), ''), 'The host'),
    'is_host', r.host_id = auth.uid(),
    'starts_at', r.starts_at, 'started', r.started_at is not null, 'ended', r.ended_at is not null,
    'ends_at', r.ends_at, 'locked', r.locked, 'allow_guests', r.allow_guests, 'waiting_room', r.waiting_room,
    'host_tier', v_tier, 'limit_minutes', case when v_tier = 'pro' then 1440 else 60 end,
    'my_status', me.status, 'my_name', me.display_name,
    'in_meeting', private.meet_live_count(r.id),
    'recording', r.ended_at is null and exists (select 1 from public.meet_participants p
                                                where p.room_id = r.id and p.status = 'admitted' and p.recording_since is not null)
  );
end $$;
