-- Feedback and suggestions from users of Workbase, Meet and Book. Optional: a rating (1–5), quick
-- tags and/or a message. Meet asks at the end of every call. Only the owner console reads it
-- (service role); nobody in a company can see what others sent. One per person per meeting
-- (sending again updates it). The meeting itself is deleted after 7 days, so the few facts we keep
-- (length, people, plan, the sender's role) are copied in; no meeting title, code or chat.

create table public.feedback (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  product         text not null check (product in ('workbase', 'meet', 'book')),
  rating          smallint check (rating between 1 and 5),
  tags            text[] not null default '{}' check (cardinality(tags) <= 8),
  message         text not null default '' check (char_length(message) <= 2000),
  user_id         uuid references auth.users (id) on delete set null,
  is_guest        boolean not null default false,
  name            text not null default '' check (char_length(name) <= 120),
  email           text,
  organization_id uuid references public.organizations (id) on delete set null,
  room_id         uuid,                       -- no foreign key: meetings are deleted after 7 days
  meet            jsonb,                      -- {minutes, people, guests, tier, role, reason}
  page            text not null default '' check (char_length(page) <= 200),
  device          text not null default '' check (char_length(device) <= 160),
  status          text not null default 'new' check (status in ('new', 'read', 'done')),
  constraint feedback_not_empty check (rating is not null or cardinality(tags) > 0 or message <> '')
);
create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_idx on public.feedback (user_id);
create index feedback_org_idx on public.feedback (organization_id);
create unique index feedback_one_per_meeting on public.feedback (user_id, room_id) where room_id is not null;

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
-- No policies: only the service role (owner console) reads it. Sending goes through submit_feedback.

create or replace function public.submit_feedback(
  p_product text, p_rating integer default null, p_tags text[] default '{}', p_message text default '',
  p_room uuid default null, p_page text default '', p_device text default '', p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_guest boolean := coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean, false);
  v_tags text[];
  v_msg text := left(trim(coalesce(p_message, '')), 2000);
  v_name text := '';
  v_email text;
  v_org uuid;
  v_meet jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_product not in ('workbase', 'meet', 'book') then raise exception 'Unknown product' using errcode = '22023'; end if;
  if p_rating is not null and p_rating not between 1 and 5 then raise exception 'Rating is 1 to 5' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct left(trim(t), 40)), '{}') into v_tags
  from unnest(coalesce(p_tags, '{}')) t where trim(t) <> '';
  if cardinality(v_tags) > 8 then v_tags := v_tags[1:8]; end if;
  if p_rating is null and cardinality(v_tags) = 0 and v_msg = '' then
    raise exception 'Pick a rating or write something' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback f where f.user_id = v_uid and f.updated_at > now() - interval '1 hour') >= 10 then
    raise exception 'Thanks! That''s a lot of feedback for one hour; try again later.' using errcode = '54000';
  end if;

  if not v_guest then
    select p.full_name, p.email into v_name, v_email from public.profiles p where p.id = v_uid;
    v_org := private.current_org_id();
  end if;

  if p_room is not null then
    select pa.display_name, jsonb_build_object(
             'role', case when pa.is_guest then 'guest' else pa.role end,
             'minutes', case when r.started_at is null then 0
                             else round(extract(epoch from (coalesce(r.ended_at, now()) - r.started_at)) / 60) end,
             'people', (select count(*) from public.meet_participants x where x.room_id = r.id and x.first_joined_at is not null),
             'guests', (select count(*) from public.meet_participants x where x.room_id = r.id and x.first_joined_at is not null and x.is_guest),
             'tier', private.meet_tier(r.host_id),
             'reason', left(coalesce(p_reason, ''), 20))
      into v_name, v_meet
    from public.meet_participants pa join public.meet_rooms r on r.id = pa.room_id
    where pa.room_id = p_room and pa.user_id = v_uid
    limit 1;
    if v_meet is null then raise exception 'You weren''t in that meeting' using errcode = '42501'; end if;
    if not v_guest then select coalesce(nullif(p.full_name, ''), v_name) into v_name from public.profiles p where p.id = v_uid; end if;
  end if;

  insert into public.feedback (product, rating, tags, message, user_id, is_guest, name, email, organization_id,
                               room_id, meet, page, device)
  values (p_product, p_rating, v_tags, v_msg, v_uid, v_guest, left(coalesce(v_name, ''), 120), v_email, v_org,
          p_room, v_meet, left(coalesce(p_page, ''), 200), left(coalesce(p_device, ''), 160))
  on conflict (user_id, room_id) where room_id is not null do update
    set rating = coalesce(excluded.rating, public.feedback.rating),
        tags = case when cardinality(excluded.tags) > 0 then excluded.tags else public.feedback.tags end,
        message = case when excluded.message <> '' then excluded.message else public.feedback.message end,
        updated_at = now(), status = 'new'
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_feedback(text, integer, text[], text, uuid, text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, integer, text[], text, uuid, text, text, text) to authenticated;

-- Owner console: summary per product + the latest messages (filters: product, stars, status).
create or replace function public.admin_feedback(p_days integer default 30, p_product text default null,
  p_status text default null, p_rating integer default null, p_limit integer default 200)
returns jsonb language sql stable security definer set search_path = '' as $$
  with f as (
    select * from public.feedback
    where created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3650))
  )
  select jsonb_build_object(
    'new', (select count(*) from public.feedback where status = 'new'),
    'products', (
      select coalesce(jsonb_object_agg(p.product, jsonb_build_object(
        'count', (select count(*) from f where f.product = p.product),
        'rated', (select count(*) from f where f.product = p.product and f.rating is not null),
        'average', (select round(avg(f.rating), 2) from f where f.product = p.product),
        'stars', (select jsonb_build_array(
                    count(*) filter (where f.rating = 1), count(*) filter (where f.rating = 2),
                    count(*) filter (where f.rating = 3), count(*) filter (where f.rating = 4),
                    count(*) filter (where f.rating = 5)) from f where f.product = p.product),
        'messages', (select count(*) from f where f.product = p.product and f.message <> ''),
        'tags', (select coalesce(jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.c) order by t.c desc, t.tag), '[]')
                 from (select tag, count(*) c from f, unnest(f.tags) tag where f.product = p.product group by tag) t)
      )), '{}')
      from (values ('workbase'), ('meet'), ('book')) p(product)
    ),
    'items', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]') from (
        select f.id, f.created_at, f.updated_at, f.product, f.rating, f.tags, f.message, f.is_guest, f.name, f.email,
               f.organization_id, o.name as company, f.meet, f.page, f.device, f.status
        from f left join public.organizations o on o.id = f.organization_id
        where (p_product is null or f.product = p_product)
          and (p_status is null or f.status = p_status)
          and (p_rating is null or f.rating = p_rating)
        order by f.created_at desc
        limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) x
    )
  )
$$;

create or replace function public.admin_feedback_status(p_ids uuid[], p_status text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if p_status not in ('new', 'read', 'done') then raise exception 'Unknown status' using errcode = '22023'; end if;
  update public.feedback set status = p_status where id = any (p_ids);
  get diagnostics v = row_count;
  return v;
end $$;

revoke execute on function public.admin_feedback(integer, text, text, integer, integer),
  public.admin_feedback_status(uuid[], text) from public, anon, authenticated;
grant execute on function public.admin_feedback(integer, text, text, integer, integer),
  public.admin_feedback_status(uuid[], text) to service_role;
