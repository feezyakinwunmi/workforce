-- Call health: each device sends a small technical summary with its heartbeat (connection states,
-- relay in use, failed requests, rebuilds, which streams it actually receives, browser). No audio,
-- video, chat or names. Only the owner (database / console) can read it; it goes with the meeting.
-- One row per person per meeting; each page load is a key inside `data` (a reload starts a new one).

create table public.meet_diag (
  participant_id uuid primary key references public.meet_participants (id) on delete cascade,
  room_id        uuid not null references public.meet_rooms (id) on delete cascade,
  data           jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);
create index meet_diag_room_idx on public.meet_diag (room_id);
alter table public.meet_diag enable row level security;
revoke all on public.meet_diag from anon, authenticated;

create or replace function public.meet_ping(p_room uuid, p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.meet_participants;
  r public.meet_rooms;
  v_load text;
begin
  select * into me from public.meet_participants where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'You are not in this meeting' using errcode = '42501'; end if;
  select * into r from public.meet_rooms where id = p_room;
  -- A waiting person may still be let in once the host starts (no waiting room).
  if me.status = 'waiting' and r.started_at is not null and not r.waiting_room and not r.locked
     and private.meet_live_count(r.id) < r.max_participants then
    update public.meet_participants set status = 'admitted', joined_at = now(), admitted_at = coalesce(admitted_at, now())
    where id = me.id returning * into me;
  end if;
  update public.meet_presence set last_seen_at = now() where participant_id = me.id;
  -- Call health (see above): small, technical, kept per page load.
  if p_patch ? 'diag' and jsonb_typeof(p_patch -> 'diag') = 'object' and octet_length((p_patch -> 'diag')::text) <= 6000 then
    v_load := left(coalesce(p_patch -> 'diag' ->> 'load', 'x'), 20);
    insert into public.meet_diag as d (participant_id, room_id, data) values (me.id, p_room, jsonb_build_object(v_load, p_patch -> 'diag'))
    on conflict (participant_id) do update set
      data = case when octet_length(d.data::text) > 40000 then jsonb_build_object(v_load, p_patch -> 'diag')
                  else d.data || jsonb_build_object(v_load, p_patch -> 'diag') end,
      updated_at = now();
  end if;
  if me.status = 'admitted' and (p_patch - 'diag') <> '{}'::jsonb then
    if p_patch ? 'tracks' and (jsonb_typeof(p_patch -> 'tracks') <> 'array' or jsonb_array_length(p_patch -> 'tracks') > 4
       or octet_length((p_patch -> 'tracks')::text) > 2000) then
      raise exception 'Bad track list' using errcode = '22023';
    end if;
    update public.meet_participants set
      audio_on = coalesce((p_patch ->> 'audio_on')::boolean, audio_on),
      video_on = coalesce((p_patch ->> 'video_on')::boolean, video_on),
      screen_on = coalesce((p_patch ->> 'screen_on')::boolean, screen_on),
      hand_raised_at = case when p_patch ? 'hand' then (case when (p_patch ->> 'hand')::boolean then coalesce(hand_raised_at, now()) end) else hand_raised_at end,
      tracks = coalesce(p_patch -> 'tracks', tracks),
      sfu_session = case when p_patch ? 'sfu_session' then left(p_patch ->> 'sfu_session', 100) else sfu_session end
    where id = me.id returning * into me;
  end if;
  return jsonb_build_object('status', me.status, 'role', me.role, 'ends_at', r.ends_at, 'ended', r.ended_at is not null,
                            'locked', r.locked, 'waiting_room', r.waiting_room, 'server_time', now());
end $$;
