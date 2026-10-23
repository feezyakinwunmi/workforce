-- Workbase Meet: Pro Max plan with AI notes (transcript → summary), 23 Oct 2026.
--
-- Pro Max = everything in Pro + AI notes, ₦8,000 per host per month, 10 hours of AI notes a month
-- (shown to the person on the Usage page). Pro and Business don't include AI notes.
--
-- How AI notes work: a host or co-host on Pro Max turns them on in a live meeting. Everyone sees
-- "AI notes on" (meet_rooms.ai_notes_since, in Realtime; the lobby says so too). That person's
-- browser mixes everyone's sound and uploads 30-second pieces to the private bucket "meet-audio"
-- (only they can add pieces, only while their notes are recording; nobody can read them back).
-- After each piece, meet_notes_chunk() counts the time against their monthly AI hours. When the
-- notes stop (button, leaving, meeting end, hours used up, or no piece for 3 minutes), the server
-- (service role) sends the sound to the speech-to-text service, has the summary written, saves
-- only the summary (meet_notes.summary) and deletes the sound and the transcript.

-- ---------------------------------------------------------------------------
-- Pro Max plan
-- ---------------------------------------------------------------------------
alter table public.meet_subscriptions
  drop constraint meet_subscriptions_plan_check,
  add constraint meet_subscriptions_plan_check check (plan in ('pro', 'promax', 'business')),
  drop constraint meet_subscriptions_check,
  add constraint meet_subscriptions_check check (plan in ('pro', 'promax') or organization_id is not null);

create or replace function private.meet_price_kobo(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'pro' then 400000 when 'promax' then 800000 when 'business' then 3000000 when 'topup' then 100000 end
$$;

-- Pro Max counts as Pro everywhere (limits, fair use).
create or replace function private.meet_personal_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meet_subscriptions s
                 where s.user_id = p_user and s.plan in ('pro', 'promax') and s.status = 'success'
                   and s.period_start <= now() and s.period_end > now())
$$;

-- AI notes seconds a month for this person: 10 hours on Pro Max, else 0.
create or replace function private.meet_ai_included(p_user uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.meet_subscriptions s
                           where s.user_id = p_user and s.plan = 'promax' and s.status = 'success'
                             and s.period_start <= now() and s.period_end > now())
              then (10 * 3600)::bigint else 0::bigint end
$$;

create table public.meet_ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month   date not null,
  seconds bigint not null default 0 check (seconds >= 0),
  primary key (user_id, month)
);
alter table public.meet_ai_usage enable row level security;
revoke all on public.meet_ai_usage from anon, authenticated;

create or replace function private.meet_ai_status(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_included bigint := private.meet_ai_included(p_user);
  v_used bigint;
begin
  select coalesce(sum(u.seconds), 0) into v_used from public.meet_ai_usage u
  where u.user_id = p_user and u.month = private.meet_month();
  return jsonb_build_object(
    'included', v_included,
    'used', v_used,
    'left', greatest(0, v_included - v_used),
    'percent', case when v_included > 0 then least(999, round(100.0 * v_used / v_included))::int else 0 end,
    'resets_at', ((private.meet_month() + interval '1 month')::timestamp at time zone 'Africa/Lagos')
  );
end $$;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
alter table public.meet_rooms add column if not exists ai_notes_since timestamptz;

create table public.meet_notes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  room_id       uuid references public.meet_rooms (id) on delete set null,
  title         text not null default '' check (char_length(title) <= 120),
  status        text not null default 'recording'
                check (status in ('recording', 'queued', 'processing', 'transcribing', 'ready', 'failed', 'empty')),
  started_at    timestamptz not null default now(),
  stopped_at    timestamptz,
  last_chunk_at timestamptz,
  chunks        integer not null default 0 check (chunks between 0 and 3000),
  seconds       integer not null default 0 check (seconds >= 0),
  mime          text not null default 'audio/webm' check (mime in ('audio/webm', 'audio/mp4', 'audio/ogg')),
  speakers      jsonb not null default '[]'::jsonb
                check (jsonb_typeof(speakers) = 'array' and octet_length(speakers::text) <= 600000),
  transcript_id text check (char_length(transcript_id) <= 100),
  summary       jsonb check (summary is null or octet_length(summary::text) <= 60000),
  error         text check (char_length(error) <= 500),
  attempts      smallint not null default 0,
  emailed_at    timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index meet_notes_owner_idx on public.meet_notes (owner_id, created_at desc);
create index meet_notes_room_idx on public.meet_notes (room_id) where status = 'recording';
create index meet_notes_work_idx on public.meet_notes (status, updated_at) where status in ('recording', 'queued', 'processing', 'transcribing');

alter table public.meet_notes enable row level security;
revoke all on public.meet_notes from anon, authenticated;
create policy "people see their own AI notes" on public.meet_notes for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "people delete their own finished AI notes" on public.meet_notes for delete to authenticated
  using (owner_id = (select auth.uid()) and status in ('ready', 'failed', 'empty'));
grant select (id, owner_id, room_id, title, status, started_at, stopped_at, seconds, summary, error, created_at)
  on public.meet_notes to authenticated;
grant delete on public.meet_notes to authenticated;

-- Sound pieces: <note id>/<00001>.webm|m4a|ogg. Only the note's owner adds them, only while it records.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meet-audio', 'meet-audio', false, 5242880, array['audio/webm', 'audio/mp4', 'audio/ogg'])
on conflict (id) do nothing;

create or replace function private.meet_note_upload_ok(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9]{5}\.(webm|m4a|ogg)$'
     and exists (select 1 from public.meet_notes n
                 where n.id::text = split_part(p_name, '/', 1) and n.owner_id = auth.uid() and n.status = 'recording')
$$;
revoke execute on function private.meet_note_upload_ok(text) from public, anon;
grant execute on function private.meet_note_upload_ok(text) to authenticated;

create policy "AI notes: owners add sound pieces while recording" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meet-audio' and private.meet_note_upload_ok(name));

-- Stop a note: queued for the server; the meeting's "AI notes on" goes off when nobody records.
create or replace function private.meet_notes_halt(p_note uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_room uuid;
begin
  update public.meet_notes set status = 'queued', stopped_at = now(), updated_at = now()
  where id = p_note and status = 'recording'
  returning room_id into v_room;
  if v_room is not null and not exists (select 1 from public.meet_notes where room_id = v_room and status = 'recording') then
    update public.meet_rooms set ai_notes_since = null where id = v_room;
  end if;
end $$;

-- Leaving the meeting, or the meeting ending, stops the notes.
create or replace function private.meet_notes_on_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_note uuid;
begin
  if old.status = 'admitted' and new.status <> 'admitted' then
    for v_note in select id from public.meet_notes where room_id = new.room_id and owner_id = new.user_id and status = 'recording' loop
      perform private.meet_notes_halt(v_note);
    end loop;
  end if;
  return null;
end $$;
create trigger meet_participants_notes after update of status on public.meet_participants
  for each row execute function private.meet_notes_on_leave();

create or replace function private.meet_notes_on_end()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_note uuid;
begin
  for v_note in select id from public.meet_notes where room_id = new.id and status = 'recording' loop
    perform private.meet_notes_halt(v_note);
  end loop;
  return null;
end $$;
create trigger meet_rooms_notes after update of ended_at on public.meet_rooms
  for each row when (old.ended_at is null and new.ended_at is not null)
  execute function private.meet_notes_on_end();

-- Turn AI notes on (admitted host/co-host with AI hours left, live meeting, one at a time).
create or replace function public.meet_notes_start(p_room uuid, p_mime text default 'audio/webm')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.meet_rooms;
  v_ai jsonb;
  v_id uuid;
begin
  if v_uid is null or private.meet_is_anonymous() then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.meet_rooms where id = p_room for update;
  if not found or r.started_at is null or r.ended_at is not null or r.ends_at <= now() then
    raise exception 'This meeting isn''t running.' using errcode = '22023';
  end if;
  if not private.meet_is_moderator(p_room) then
    raise exception 'Only the host or a co-host can turn on AI notes.' using errcode = '42501';
  end if;
  v_ai := private.meet_ai_status(v_uid);
  if (v_ai ->> 'included')::bigint = 0 then
    raise exception 'AI notes come with Meet Pro Max.' using errcode = '42501';
  end if;
  if (v_ai ->> 'left')::bigint < 60 then
    raise exception 'This month''s AI notes time is used up. It resets on the 1st.' using errcode = '54000';
  end if;
  if exists (select 1 from public.meet_notes where room_id = p_room and status = 'recording') then
    raise exception 'AI notes are already on in this meeting.' using errcode = '22023';
  end if;
  if (select count(*) from public.meet_notes where owner_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many AI notes today. Try again tomorrow.' using errcode = '54000';
  end if;
  insert into public.meet_notes (owner_id, room_id, title, mime)
  values (v_uid, p_room, left(coalesce(r.title, ''), 120),
          case when p_mime in ('audio/webm', 'audio/mp4', 'audio/ogg') then p_mime else 'audio/webm' end)
  returning id into v_id;
  update public.meet_rooms set ai_notes_since = now() where id = p_room;
  return jsonb_build_object('id', v_id, 'left', (v_ai ->> 'left')::bigint);
end $$;

-- After each uploaded piece: count its time (capped by the clock), keep who was speaking.
-- Returns how much AI time is left; stops the notes when it runs out.
create or replace function public.meet_notes_chunk(p_note uuid, p_seq integer, p_seconds integer, p_speakers jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n public.meet_notes;
  v_secs integer;
  v_left bigint;
begin
  select * into n from public.meet_notes where id = p_note and owner_id = auth.uid() for update;
  if not found then raise exception 'Notes not found' using errcode = 'P0002'; end if;
  if p_seq <= n.chunks then
    return jsonb_build_object('ok', true, 'left', (private.meet_ai_status(n.owner_id) ->> 'left')::bigint, 'stopped', n.status <> 'recording');
  end if;
  if n.status <> 'recording' then raise exception 'These notes have stopped.' using errcode = '22023'; end if;
  if p_seq <> n.chunks + 1 then raise exception 'Piece % is missing', n.chunks + 1 using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'meet-audio'
                 and o.name ~ ('^' || p_note::text || '/' || lpad(p_seq::text, 5, '0') || '\.(webm|m4a|ogg)$')) then
    raise exception 'Upload the piece first' using errcode = '22023';
  end if;
  v_secs := least(greatest(coalesce(p_seconds, 0), 0), 45,
                  ceil(extract(epoch from now() - coalesce(n.last_chunk_at, n.started_at)))::int + 10);
  update public.meet_notes set
    chunks = p_seq, seconds = seconds + v_secs, last_chunk_at = now(), updated_at = now(),
    speakers = case when jsonb_typeof(p_speakers) = 'array' and jsonb_array_length(p_speakers) <= 300
                         and octet_length(speakers::text) + octet_length(p_speakers::text) <= 600000
                    then speakers || p_speakers else speakers end
  where id = p_note;
  insert into public.meet_ai_usage as u (user_id, month, seconds) values (n.owner_id, private.meet_month(), v_secs)
  on conflict (user_id, month) do update set seconds = u.seconds + excluded.seconds;
  v_left := (private.meet_ai_status(n.owner_id) ->> 'left')::bigint;
  if v_left <= 0 then perform private.meet_notes_halt(p_note); end if;
  return jsonb_build_object('ok', true, 'left', v_left, 'stopped', v_left <= 0);
end $$;

create or replace function public.meet_notes_stop(p_note uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select status into v_status from public.meet_notes where id = p_note and owner_id = auth.uid();
  if not found then raise exception 'Notes not found' using errcode = 'P0002'; end if;
  if v_status = 'recording' then perform private.meet_notes_halt(p_note); return 'queued'; end if;
  return v_status;
end $$;

-- Server only: notes to work on now. Stale recordings (no piece for 3 minutes) are stopped; each
-- returned note is leased for a while (updated_at) so two runs don't do the same work.
create or replace function public.meet_notes_due()
returns table (id uuid, status text, chunks integer, seconds integer, mime text, transcript_id text, owner_id uuid, attempts smallint)
language plpgsql security definer set search_path = '' as $$
declare
  v_note uuid;
begin
  for v_note in select n.id from public.meet_notes n
                where n.status = 'recording' and coalesce(n.last_chunk_at, n.started_at) < now() - interval '3 minutes' loop
    perform private.meet_notes_halt(v_note);
  end loop;
  -- Gave up after 6 tries.
  update public.meet_notes n set status = 'failed', error = coalesce(n.error, 'Couldn''t finish the summary.'), updated_at = now()
  where n.status in ('queued', 'processing', 'transcribing') and n.attempts >= 6 and n.updated_at < now() - interval '2 minutes';
  return query
  with due as (
    select n.id from public.meet_notes n
    where n.attempts < 6 and (
          n.status = 'queued'
       or (n.status = 'transcribing' and n.updated_at < now() - interval '90 seconds')
       or (n.status = 'processing' and n.updated_at < now() - interval '10 minutes'))
    order by n.updated_at
    limit 10
    for update skip locked
  )
  update public.meet_notes n set
    status = case when n.status = 'queued' then 'processing' else n.status end,
    attempts = n.attempts + 1, updated_at = now()
  from due where n.id = due.id
  returning n.id, (case when n.status = 'processing' and n.transcript_id is null then 'processing' else n.status end), n.chunks, n.seconds, n.mime, n.transcript_id, n.owner_id, n.attempts;
end $$;

-- Every minute: ask the app to work on notes, only when something is waiting.
create or replace function private.request_notes_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.meet_notes n
             where n.attempts < 6 and (
                   n.status = 'queued'
                or (n.status = 'recording' and coalesce(n.last_chunk_at, n.started_at) < now() - interval '3 minutes')
                or (n.status = 'transcribing' and n.updated_at < now() - interval '90 seconds')
                or (n.status = 'processing' and n.updated_at < now() - interval '10 minutes'))) then
    perform net.http_post(
      url := 'https://phantomire-workforce.vercel.app/api/meet/notes/process',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 20000);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What the pages read
-- ---------------------------------------------------------------------------
create or replace function public.meet_room_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.meet_rooms;
  me public.meet_participants;
  v_pool record;
  v_status jsonb;
begin
  select * into r from public.meet_rooms where code = lower(trim(p_code));
  if not found then return null; end if;
  select * into me from public.meet_participants where room_id = r.id and user_id = auth.uid();
  select * into v_pool from private.meet_pool(r.host_id);
  if r.host_id = auth.uid() and r.started_at is null then
    v_status := private.meet_pool_status(v_pool.pool);
  end if;
  return jsonb_build_object(
    'id', r.id, 'code', r.code, 'title', r.title,
    'host_name', coalesce(nullif((select full_name from public.profiles where id = r.host_id), ''), 'The host'),
    'is_host', r.host_id = auth.uid(),
    'starts_at', r.starts_at, 'started', r.started_at is not null, 'ended', r.ended_at is not null,
    'ends_at', r.ends_at, 'locked', r.locked, 'allow_guests', r.allow_guests, 'waiting_room', r.waiting_room,
    'host_tier', v_pool.tier, 'limit_minutes', case when v_pool.tier = 'pro' then 1440 else 60 end,
    'my_status', me.status, 'my_name', me.display_name,
    'in_meeting', private.meet_live_count(r.id),
    'recording', r.ended_at is null and exists (select 1 from public.meet_participants p
                                                where p.room_id = r.id and p.status = 'admitted' and p.recording_since is not null),
    'cameras_off', case when r.started_at is not null then r.cameras_off
                        when v_status is not null then (v_status ->> 'left')::bigint <= 0 else false end,
    'usage_percent', (v_status ->> 'percent')::int,
    'ai_notes', r.ended_at is null and r.ai_notes_since is not null,
    -- My own AI notes hours (signed-in people only): null = no Pro Max.
    'my_ai', case when auth.uid() is not null and not private.meet_is_anonymous()
                       and private.meet_ai_included(auth.uid()) > 0
                  then private.meet_ai_status(auth.uid()) end
  );
end $$;

create or replace function public.meet_my_plan()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pool record;
  v_admin boolean;
begin
  select * into v_pool from private.meet_pool(v_uid);
  v_admin := exists (select 1 from public.memberships m where m.user_id = v_uid and m.status = 'active' and m.role in ('owner', 'admin'));
  return jsonb_build_object(
    'tier', v_pool.tier,
    'promax', private.meet_ai_included(v_uid) > 0,
    'pro_price_kobo', private.meet_price_kobo('pro'),
    'promax_price_kobo', private.meet_price_kobo('promax'),
    'business_price_kobo', private.meet_price_kobo('business'),
    'topup_price_kobo', private.meet_price_kobo('topup'),
    'paid_until', (select max(s.period_end) from public.meet_subscriptions s
                   where s.user_id = v_uid and s.status = 'success' and s.period_end > now()),
    'org_id', (select m.organization_id from public.memberships m where m.user_id = v_uid and m.status = 'active' limit 1),
    'is_org_admin', v_admin,
    'pool_kind', case when left(v_pool.pool, 2) = 'o:' then 'company' else 'personal' end,
    'company_name', case when v_pool.org is not null then (select o.name from public.organizations o where o.id = v_pool.org) end,
    'can_top_up', not private.meet_is_anonymous() and (left(v_pool.pool, 2) = 'u:' or v_admin),
    'usage', private.meet_pool_status(v_pool.pool),
    'ai', private.meet_ai_status(v_uid)
  );
end $$;

create or replace function public.meet_start_payment(p_plan text, p_months integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_amount integer;
  v_ref text;
begin
  if v_uid is null or private.meet_is_anonymous() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_plan not in ('pro', 'promax', 'business') or p_months not in (1, 3, 6, 12) then
    raise exception 'Choose a plan and 1, 3, 6 or 12 months' using errcode = '22023';
  end if;
  if p_plan = 'business' then
    select m.organization_id into v_org from public.memberships m
    where m.user_id = v_uid and m.status = 'active' and m.role in ('owner', 'admin') limit 1;
    if v_org is null then
      raise exception 'Meet Business is for Workbase companies. Create your company first, as its owner or admin.' using errcode = '42501';
    end if;
  end if;
  v_amount := private.meet_price_kobo(p_plan) * (case when p_months = 12 then 10 else p_months end);
  v_ref := 'meet_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.meet_subscriptions (user_id, organization_id, plan, months, amount_kobo, reference)
  values (v_uid, v_org, p_plan, p_months, v_amount, v_ref);
  return jsonb_build_object('reference', v_ref, 'amount_kobo', v_amount,
                            'email', (select email from public.profiles where id = v_uid));
end $$;

create or replace function public.meet_confirm_payment(p_reference text, p_amount_kobo integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  s public.meet_subscriptions;
  t public.meet_topups;
  v_start timestamptz;
begin
  if p_reference like 'meet\_top\_%' then
    select * into t from public.meet_topups where reference = p_reference for update;
    if not found then return false; end if;
    if t.status = 'success' then return true; end if;
    if p_amount_kobo < t.amount_kobo then
      update public.meet_topups set status = 'failed' where id = t.id;
      return false;
    end if;
    update public.meet_topups set status = 'success', paid_at = now(), expires_at = now() + interval '12 months' where id = t.id;
    perform private.meet_cameras_back(t.pool);
    return true;
  end if;

  select * into s from public.meet_subscriptions where reference = p_reference for update;
  if not found then return false; end if;
  if s.status = 'success' then return true; end if;
  if p_amount_kobo < s.amount_kobo then
    update public.meet_subscriptions set status = 'failed' where id = s.id;
    return false;
  end if;
  -- Plans stack after the current period of the same plan (Pro and Pro Max separately).
  select greatest(now(), coalesce(max(x.period_end), now())) into v_start from public.meet_subscriptions x
  where x.status = 'success' and x.plan = s.plan
    and (case when s.plan in ('pro', 'promax') then x.user_id = s.user_id else x.organization_id = s.organization_id end);
  update public.meet_subscriptions set status = 'success', period_start = v_start,
    period_end = v_start + make_interval(months => s.months) where id = s.id;
  perform private.meet_cameras_back(case when s.plan in ('pro', 'promax') then 'u:' || s.user_id::text else 'o:' || s.organization_id::text end);
  return true;
end $$;

-- Owner console: also AI notes hours this month and Pro Max hosts.
create or replace function public.admin_meet_usage(p_months integer default 6)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
               'free_seconds', coalesce((select sum(u.seconds) from public.meet_usage u
                                         where u.month = g.m and left(u.pool, 2) = 'u:' and not exists (
                                           select 1 from public.meet_subscriptions s where s.status = 'success' and s.plan in ('pro', 'promax')
                                             and 'u:' || s.user_id::text = u.pool and s.period_start < g.m + interval '1 month' and s.period_end > g.m)), 0),
               'paid_seconds', coalesce((select sum(u.seconds) from public.meet_usage u where u.month = g.m), 0)
                 - coalesce((select sum(u.seconds) from public.meet_usage u
                             where u.month = g.m and left(u.pool, 2) = 'u:' and not exists (
                               select 1 from public.meet_subscriptions s where s.status = 'success' and s.plan in ('pro', 'promax')
                                 and 'u:' || s.user_id::text = u.pool and s.period_start < g.m + interval '1 month' and s.period_end > g.m)), 0),
               'ai_seconds', coalesce((select sum(a.seconds) from public.meet_ai_usage a where a.month = g.m), 0))
             order by g.m)
      from (select generate_series(private.meet_month() - make_interval(months => least(greatest(coalesce(p_months, 6), 1), 24) - 1),
                                   private.meet_month(), interval '1 month')::date as m) g), '[]'::jsonb),
    'pools_this_month', (select count(*) from public.meet_usage u where u.month = private.meet_month()),
    'pools_over_80', (select count(*) from public.meet_usage u
                      where u.month = private.meet_month() and u.seconds >= 0.8 * greatest(private.meet_pool_included(u.pool), 1)),
    'cameras_off_live', (select count(*) from public.meet_rooms r where r.ended_at is null and r.started_at is not null and r.cameras_off),
    'topups', (select jsonb_build_object('count', count(*), 'kobo', coalesce(sum(t.amount_kobo), 0),
                                         'hours_left', coalesce(sum(t.seconds - t.used_seconds) filter (where t.expires_at > now()), 0) / 3600)
               from public.meet_topups t where t.status = 'success'),
    'promax_hosts', (select count(distinct s.user_id) from public.meet_subscriptions s
                     where s.plan = 'promax' and s.status = 'success' and s.period_start <= now() and s.period_end > now()),
    'notes', (select jsonb_build_object('ready', count(*) filter (where n.status = 'ready'),
                                        'failed', count(*) filter (where n.status = 'failed'),
                                        'working', count(*) filter (where n.status in ('recording', 'queued', 'processing', 'transcribing')))
              from public.meet_notes n where n.created_at > now() - interval '30 days')
  )
$$;

-- ---------------------------------------------------------------------------
-- Grants and jobs
-- ---------------------------------------------------------------------------
revoke execute on function private.meet_ai_included(uuid), private.meet_ai_status(uuid), private.meet_notes_halt(uuid),
  private.meet_notes_on_leave(), private.meet_notes_on_end(), private.request_notes_dispatch()
  from public, anon, authenticated;
revoke execute on function public.meet_notes_start(uuid, text), public.meet_notes_chunk(uuid, integer, integer, jsonb),
  public.meet_notes_stop(uuid) from public, anon;
grant execute on function public.meet_notes_start(uuid, text), public.meet_notes_chunk(uuid, integer, integer, jsonb),
  public.meet_notes_stop(uuid) to authenticated;
revoke execute on function public.meet_notes_due() from public, anon, authenticated;
grant execute on function public.meet_notes_due() to service_role;

select cron.schedule('meet-notes', '* * * * *', 'select private.request_notes_dispatch()');
