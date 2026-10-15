-- Performance: goals and reviews, built on the hours and tasks the app already tracks.
--
-- goals: a person's goals with progress. The person and the managers/admins who can see them
--   read and update them; managers/admins can set goals for their people.
-- reviews: a review of one person for a period, by a manager or admin who can see them.
--   self_review     → the person writes a self-assessment (optional step)
--   manager_review  → the reviewer writes feedback (only reviewer and admins see it so far)
--   shared          → the person sees the feedback
--   acknowledged    → the person has read it (with an optional comment)
--   review_feedback holds the reviewer's part, readable by the person only once shared.
--   stats: a snapshot of hours, activity, tasks and leave for the period, taken when created.

create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null,
  title           text not null check (char_length(title) between 2 and 200),
  details         text check (char_length(details) <= 2000),
  due_on          date,
  progress        integer not null default 0 check (progress between 0 and 100),
  status          text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index goals_user_idx on public.goals (organization_id, user_id, status);
create index goals_created_by_idx on public.goals (created_by);

-- Can the current user manage this person's goals and reviews? (manager/admin who can see them)
create or replace function private.can_review(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_manager_or_admin() and p_user = any (private.visible_member_ids());
$$;
revoke execute on function private.can_review(uuid) from public, anon;
grant execute on function private.can_review(uuid) to authenticated;

create or replace function private.guard_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  manages boolean := private.can_review(coalesce(new.user_id, old.user_id)) and coalesce(new.user_id, old.user_id) <> auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() and not manages then
      raise exception 'You can set goals for yourself or the people you manage' using errcode = '42501';
    end if;
    new.organization_id := private.current_org_id();
    new.created_by := auth.uid();
    new.created_at := now();
    if new.user_id <> auth.uid() then
      perform private.notify(new.organization_id, new.user_id, 'review',
        coalesce(private.person_name(auth.uid()), 'Your manager') || ' set you a goal', new.title, '/dashboard/reviews', null, auth.uid());
    end if;
  else
    new.id := old.id;
    new.organization_id := old.organization_id;
    new.user_id := old.user_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.status = 'done' then
    new.progress := 100;
  end if;
  new.title := trim(new.title);
  new.updated_at := now();
  return new;
end $$;

create trigger goals_guard before insert or update on public.goals
  for each row execute function private.guard_goal();

alter table public.goals enable row level security;
create policy "the person and their managers read goals" on public.goals
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or ((select private.is_manager_or_admin()) and user_id = any ((select private.visible_member_ids())::uuid[]))));
create policy "the person and their managers add goals" on public.goals
  for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (user_id = (select auth.uid()) or ((select private.is_manager_or_admin()) and user_id = any ((select private.visible_member_ids())::uuid[]))));
create policy "the person and their managers change goals" on public.goals
  for update to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or ((select private.is_manager_or_admin()) and user_id = any ((select private.visible_member_ids())::uuid[]))))
  with check (organization_id = (select private.current_org_id()));
create policy "the person and their managers remove goals" on public.goals
  for delete to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or ((select private.is_manager_or_admin()) and user_id = any ((select private.visible_member_ids())::uuid[]))));

revoke all on public.goals from anon, authenticated;
grant select, delete on public.goals to authenticated;
grant insert (user_id, title, details, due_on, progress, status), update (title, details, due_on, progress, status)
  on public.goals to authenticated;

-- ---------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id         uuid not null,
  reviewer_id     uuid references auth.users (id) on delete set null,
  title           text not null check (char_length(title) between 2 and 120),
  period_start    date not null,
  period_end      date not null check (period_end >= period_start),
  status          text not null check (status in ('self_review', 'manager_review', 'shared', 'acknowledged')),
  self_assessment text check (char_length(self_assessment) <= 5000),
  self_submitted_at timestamptz,
  stats           jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) < 4000),
  shared_at       timestamptz,
  acknowledged_at timestamptz,
  acknowledgement text check (char_length(acknowledgement) <= 2000),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index reviews_user_idx on public.reviews (organization_id, user_id, created_at desc);
create index reviews_reviewer_idx on public.reviews (reviewer_id);

create table public.review_feedback (
  review_id    uuid primary key references public.reviews (id) on delete cascade,
  rating       integer check (rating between 1 and 5),
  strengths    text check (char_length(strengths) <= 5000),
  improvements text check (char_length(improvements) <= 5000),
  summary      text check (char_length(summary) <= 5000),
  updated_at   timestamptz not null default now()
);

alter table public.reviews enable row level security;
alter table public.review_feedback enable row level security;

-- The person sees their reviews; the reviewer and the managers/admins who can see the person too.
create policy "the person, reviewer and managers read reviews" on public.reviews
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or reviewer_id = (select auth.uid())
              or ((select private.is_manager_or_admin()) and user_id = any ((select private.visible_member_ids())::uuid[]))));
-- Feedback: reviewer and managers/admins always; the person only once it is shared.
create policy "feedback for the reviewer, managers and (once shared) the person" on public.review_feedback
  for select to authenticated
  using (exists (
    select 1 from public.reviews r
    where r.id = review_id and r.organization_id = (select private.current_org_id())
      and ((r.user_id = (select auth.uid()) and r.status in ('shared', 'acknowledged'))
           or (r.user_id <> (select auth.uid())
               and (r.reviewer_id = (select auth.uid())
                    or ((select private.is_manager_or_admin()) and r.user_id = any ((select private.visible_member_ids())::uuid[])))))));

revoke all on public.reviews, public.review_feedback from anon, authenticated;
grant select on public.reviews, public.review_feedback to authenticated;

create or replace function public.create_review(
  p_user uuid, p_title text, p_from date, p_to date, p_self boolean, p_stats jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_org uuid := private.current_org_id();
begin
  if p_user = auth.uid() then
    raise exception 'Someone else has to review you' using errcode = '42501';
  end if;
  if not private.can_review(p_user) then
    raise exception 'You can review the people you manage' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Pick a period of up to about a year' using errcode = '22023';
  end if;
  insert into public.reviews (organization_id, user_id, reviewer_id, title, period_start, period_end, status, stats)
  values (v_org, p_user, auth.uid(), left(trim(p_title), 120), p_from, p_to,
          case when p_self then 'self_review' else 'manager_review' end,
          case when jsonb_typeof(p_stats) = 'object' and pg_column_size(p_stats) < 4000 then p_stats else '{}'::jsonb end)
  returning id into v_id;
  insert into public.review_feedback (review_id) values (v_id);
  if p_self then
    perform private.notify(v_org, p_user, 'review', 'Write your self-assessment',
      trim(p_title) || ' with ' || coalesce(private.person_name(auth.uid()), 'your manager'), '/dashboard/reviews/' || v_id, null, auth.uid());
  end if;
  perform private.log_audit(v_org, 'review.created', 'member', null, jsonb_build_object('review_id', v_id, 'user_id', p_user));
  return v_id;
end $$;

create or replace function public.submit_self_review(p_id uuid, p_text text, p_final boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Review not found' using errcode = '22023';
  end if;
  if r.status <> 'self_review' then
    raise exception 'Your self-assessment was already sent' using errcode = '22023';
  end if;
  update public.reviews
  set self_assessment = nullif(left(trim(coalesce(p_text, '')), 5000), ''),
      status = case when p_final then 'manager_review' else status end,
      self_submitted_at = case when p_final then now() else null end
  where id = r.id;
  if p_final then
    perform private.notify(r.organization_id, r.reviewer_id, 'review',
      coalesce(private.person_name(auth.uid()), 'Someone') || ' sent their self-assessment', r.title,
      '/dashboard/reviews/' || r.id, null, auth.uid());
  end if;
end $$;

create or replace function public.save_review_feedback(
  p_id uuid, p_rating integer, p_strengths text, p_improvements text, p_summary text, p_share boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_id and organization_id = private.current_org_id() for update;
  if not found then
    raise exception 'Review not found' using errcode = '22023';
  end if;
  if r.user_id = auth.uid() or not (r.reviewer_id = auth.uid() or private.can_review(r.user_id)) then
    raise exception 'Only the reviewer or an admin can write feedback' using errcode = '42501';
  end if;
  if r.status in ('shared', 'acknowledged') then
    raise exception 'This review was already shared' using errcode = '22023';
  end if;
  insert into public.review_feedback (review_id, rating, strengths, improvements, summary, updated_at)
  values (r.id, case when p_rating between 1 and 5 then p_rating end,
          nullif(left(trim(coalesce(p_strengths, '')), 5000), ''), nullif(left(trim(coalesce(p_improvements, '')), 5000), ''),
          nullif(left(trim(coalesce(p_summary, '')), 5000), ''), now())
  on conflict (review_id) do update
    set rating = excluded.rating, strengths = excluded.strengths, improvements = excluded.improvements,
        summary = excluded.summary, updated_at = now();
  if p_share then
    if p_rating is null or p_rating not between 1 and 5 then
      raise exception 'Give an overall rating before sharing' using errcode = '22023';
    end if;
    update public.reviews set status = 'shared', shared_at = now() where id = r.id;
    perform private.notify(r.organization_id, r.user_id, 'review', 'Your review is ready', r.title,
      '/dashboard/reviews/' || r.id, null, auth.uid());
    perform private.log_audit(r.organization_id, 'review.shared', 'member', null, jsonb_build_object('review_id', r.id, 'user_id', r.user_id));
  end if;
end $$;

create or replace function public.acknowledge_review(p_id uuid, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_id and user_id = auth.uid() for update;
  if not found or r.status <> 'shared' then
    raise exception 'Nothing to acknowledge' using errcode = '22023';
  end if;
  update public.reviews
  set status = 'acknowledged', acknowledged_at = now(), acknowledgement = nullif(left(trim(coalesce(p_comment, '')), 2000), '')
  where id = r.id;
  perform private.notify(r.organization_id, r.reviewer_id, 'review',
    coalesce(private.person_name(auth.uid()), 'Someone') || ' read their review', coalesce(nullif(trim(coalesce(p_comment, '')), ''), r.title),
    '/dashboard/reviews/' || r.id, null, auth.uid());
end $$;

revoke execute on function public.create_review(uuid, text, date, date, boolean, jsonb),
                           public.submit_self_review(uuid, text, boolean),
                           public.save_review_feedback(uuid, integer, text, text, text, boolean),
                           public.acknowledge_review(uuid, text) from public, anon;
grant execute on function public.create_review(uuid, text, date, date, boolean, jsonb),
                          public.submit_self_review(uuid, text, boolean),
                          public.save_review_feedback(uuid, integer, text, text, text, boolean),
                          public.acknowledge_review(uuid, text) to authenticated;
