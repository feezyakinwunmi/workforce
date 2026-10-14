-- Screenshots (Pro plan, off by default).
--
-- * Only a company on Pro can switch them on (Company settings); the database refuses otherwise.
-- * When they are switched on or their rules change, every member is notified, and the desktop
--   app asks each worker to agree before it takes any (settings.screenshots_changed_at is
--   the version they agree to).
-- * The desktop app takes one at a random moment in each interval while clocked in, optionally
--   blurred on the computer before upload. Files: private bucket "screenshots",
--   path <company id>/<user id>/<screenshot id>.jpg.
-- * Who sees them: the same people who see that person's activity (visible_member_ids).
--   Workers see their own and may delete any of them; the row stays as "deleted by the worker".
-- * Kept for private.screenshot_retention_days() days; the dashboard's daily job removes older ones.

create or replace function private.screenshot_retention_days()
returns integer language sql immutable set search_path = '' as $$ select 90 $$;

-- Screenshots are taken only while the company is on Pro and has them switched on.
create or replace function private.screenshots_on(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((o.settings ->> 'screenshots_enabled')::boolean, false)
         and (select b.tier from private.org_billing(o.id) b) = 'pro'
  from public.organizations o where o.id = p_org;
$$;

create table public.screenshots (
  id              uuid primary key,                -- chosen by the desktop app, so uploads can be retried safely
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null,
  session_id      uuid,
  taken_at        timestamptz not null,
  path            text not null unique,
  app             text,
  blurred         boolean not null default false,
  width           integer,
  height          integer,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index screenshots_org_user_time_idx on public.screenshots (organization_id, user_id, taken_at desc);
create index screenshots_taken_idx on public.screenshots (taken_at);

alter table public.screenshots enable row level security;
create policy "see screenshots of people you can see" on public.screenshots
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and user_id = any ((select private.visible_member_ids())::uuid[]));
revoke all on public.screenshots from anon, authenticated;
grant select on public.screenshots to authenticated;

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Whose screenshot a file path is, or null if malformed or in another company.
create or replace function private.screenshot_owner(p_name text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  u constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or p_name !~ ('^' || u || '/' || u || '/' || u || '\.jpg$') then
    return null;
  end if;
  if split_part(p_name, '/', 1)::uuid is distinct from private.current_org_id() then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end $$;
revoke execute on function private.screenshot_owner(text) from public, anon;
grant execute on function private.screenshot_owner(text) to authenticated;
revoke execute on function private.screenshots_on(uuid) from public, anon;
grant execute on function private.screenshots_on(uuid) to authenticated;

create policy "screenshots: upload your own while switched on" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots'
              and private.screenshot_owner(name) = (select auth.uid())
              and private.screenshots_on((select private.current_org_id())));
create policy "screenshots: see people you can see" on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots'
         and private.screenshot_owner(name) = any ((select private.visible_member_ids())::uuid[]));

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
-- Desktop app, after uploading the file. Idempotent (same id twice = no change).
create or replace function public.add_screenshot(
  p_id uuid, p_path text, p_taken_at timestamptz, p_session_id uuid default null,
  p_app text default null, p_blurred boolean default false, p_width integer default null, p_height integer default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
begin
  if v_org is null then
    raise exception 'Your account is not active in any company' using errcode = '42501';
  end if;
  if private.screenshot_owner(p_path) is distinct from auth.uid() then
    raise exception 'Not your screenshot' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'screenshots' and o.name = p_path and o.owner_id = auth.uid()::text) then
    raise exception 'Upload the file first' using errcode = '22023';
  end if;
  if p_taken_at > now() + interval '5 minutes' or p_taken_at < now() - interval '3 days' then
    raise exception 'Screenshot time out of range' using errcode = '22023';
  end if;
  insert into public.screenshots (id, organization_id, user_id, session_id, taken_at, path, app, blurred, width, height)
  values (p_id, v_org, auth.uid(), p_session_id, p_taken_at, p_path, left(p_app, 120), coalesce(p_blurred, false),
          least(greatest(p_width, 1), 10000), least(greatest(p_height, 1), 10000))
  on conflict (id) do nothing;
  return true;
end $$;

-- A worker deletes one of their own screenshots (the dashboard then removes the file).
create or replace function public.delete_my_screenshot(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
begin
  update public.screenshots set deleted_at = now()
  where id = p_id and user_id = auth.uid() and deleted_at is null
  returning path into v_path;
  if v_path is null then
    raise exception 'You can only delete your own screenshots' using errcode = '42501';
  end if;
  return v_path;
end $$;

create policy "screenshots: workers remove their own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots' and private.screenshot_owner(name) = (select auth.uid()));

revoke execute on function public.add_screenshot(uuid, text, timestamptz, uuid, text, boolean, integer, integer),
                           public.delete_my_screenshot(uuid)
  from public, anon;
grant execute on function public.add_screenshot(uuid, text, timestamptz, uuid, text, boolean, integer, integer),
                          public.delete_my_screenshot(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- Company setting: Pro only; every change is versioned, audited and announced
-- ---------------------------------------------------------------------
create or replace function private.guard_screenshot_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  was_on  boolean := coalesce((old.settings ->> 'screenshots_enabled')::boolean, false);
  is_on   boolean := coalesce((new.settings ->> 'screenshots_enabled')::boolean, false);
  minutes integer;
  r       record;
begin
  minutes := coalesce((new.settings ->> 'screenshot_interval_minutes')::integer, 10);
  if minutes not in (5, 10, 15, 20, 30, 60) then
    minutes := 10;
  end if;
  new.settings := new.settings || jsonb_build_object(
    'screenshots_enabled', is_on,
    'screenshot_interval_minutes', minutes,
    'blur_screenshots', coalesce((new.settings ->> 'blur_screenshots')::boolean, false));
  -- The version the desktop app asks workers to agree to is never set by hand.
  new.settings := jsonb_set(new.settings, '{screenshots_changed_at}', coalesce(old.settings -> 'screenshots_changed_at', 'null'::jsonb));

  if is_on and not was_on and (select b.tier from private.org_billing(new.id) b) <> 'pro' then
    raise exception 'Screenshots are part of the Pro plan. Upgrade under Plan and billing first.' using errcode = '42501';
  end if;

  if is_on is distinct from was_on
     or (is_on and (new.settings -> 'screenshot_interval_minutes' is distinct from old.settings -> 'screenshot_interval_minutes'
                    or new.settings -> 'blur_screenshots' is distinct from old.settings -> 'blur_screenshots')) then
    new.settings := jsonb_set(new.settings, '{screenshots_changed_at}', to_jsonb(now()));
    perform private.log_audit(new.id, case when is_on then 'screenshots.on' else 'screenshots.off' end, 'organization', new.id,
      jsonb_build_object('interval_minutes', minutes, 'blur', new.settings -> 'blur_screenshots'));
    for r in select m.user_id from public.memberships m where m.organization_id = new.id and m.status = 'active' loop
      perform private.notify(new.id, r.user_id, 'announcement',
        case when not is_on then 'Screenshots are now off'
             when was_on then 'Screenshot rules changed'
             else 'Screenshots are being switched on' end,
        case when not is_on then 'The desktop app no longer takes screenshots.'
             else 'While you are clocked in, the desktop app will take a screenshot at a random moment about every '
                  || minutes || ' minutes' || case when (new.settings ->> 'blur_screenshots')::boolean then ', blurred before upload' else '' end
                  || '. The app asks you to agree first. You can see and delete yours under Screenshots.' end,
        '/dashboard/screenshots', null, auth.uid());
    end loop;
  end if;
  return new;
end $$;

create trigger organizations_screenshot_settings before update of settings on public.organizations
  for each row execute function private.guard_screenshot_settings();
