-- =====================================================================
-- Week 1 · Core: companies, members, teams, invitations, audit log
--
-- Multi-tenancy rule: every row belongs to one organization, and
-- row-level security (RLS) only lets a signed-in user see rows of the
-- organization they are an ACTIVE member of. Suspended or removed
-- members lose access immediately.
--
-- Everything sensitive (creating a company, accepting an invite)
-- goes through SECURITY DEFINER functions with their own checks.
-- =====================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.member_role   as enum ('owner', 'admin', 'manager', 'worker');
create type public.member_status as enum ('active', 'suspended', 'removed');

-- ---------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.is_valid_timezone(tz text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

create or replace function private.slugify(v text)
returns text language sql immutable set search_path = '' as $$
  -- Strip accents first so "Ẹ̀wé Ọ̀jà" becomes "ewe-oja", not "w-j".
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(normalize(coalesce(v, ''), NFD), '[\u0300-\u036f]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function private.check_timezone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_valid_timezone(new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 2 and 120),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country_code     char(2) not null default 'NG' check (country_code ~ '^[A-Z]{2}$'),
  timezone         text not null default 'Africa/Lagos',
  billing_currency text not null default 'NGN' check (billing_currency in ('NGN', 'USD')),
  plan             text not null default 'trial' check (plan in ('trial', 'basic', 'pro', 'business')),
  trial_ends_at    timestamptz not null default now() + interval '14 days',
  settings         jsonb not null default jsonb_build_object(
                     'idle_timeout_minutes', 5,
                     'track_apps', true,
                     'track_urls', false,
                     'screenshots_enabled', false,
                     'screenshot_interval_minutes', 10,
                     'blur_screenshots', false
                   ),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One row per person (shared across the app; email copied for display,
-- because auth.users is never exposed to the browser).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  manager_id      uuid,
  created_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.memberships (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  role                   public.member_role   not null default 'worker',
  status                 public.member_status not null default 'active',
  team_id                uuid,
  job_title              text check (char_length(job_title) <= 80),
  timezone               text not null default 'Africa/Lagos',
  expected_hours_per_day numeric(4, 2) not null default 8 check (expected_hours_per_day between 0 and 24),
  joined_at              timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, user_id),
  foreign key (organization_id, team_id)
    references public.teams (organization_id, id) on delete set null (team_id)
);

-- MVP rule: a person belongs to one company at a time.
create unique index memberships_one_company_per_user
  on public.memberships (user_id) where status <> 'removed';
create index memberships_org_idx on public.memberships (organization_id);

-- A team's manager must be a member of the same company.
alter table public.teams
  add foreign key (organization_id, manager_id)
  references public.memberships (organization_id, user_id) on delete set null (manager_id);

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            public.member_role not null default 'worker' check (role <> 'owner'),
  team_id         uuid,
  token           text not null unique
                    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  invited_by      uuid references auth.users (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, team_id)
    references public.teams (organization_id, id) on delete set null (team_id)
);

create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_org_idx on public.invitations (organization_id);

create table public.audit_logs (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null,
  target_type     text,
  target_id       uuid,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- Who is the current user? (used by every RLS policy)
-- SECURITY DEFINER so policies don't recurse into memberships' own RLS.
-- Wrap calls as (select private.fn()) in policies so Postgres runs
-- them once per query instead of once per row.
-- ---------------------------------------------------------------------
create or replace function private.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

create or replace function private.current_member_role()
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role
  from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

create or replace function private.is_org_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_member_role() in ('owner', 'admin'), false);
$$;

create or replace function private.log_audit(
  p_org uuid, p_action text, p_target_type text default null,
  p_target_id uuid default null, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_id, action, target_type, target_id, details)
  values (p_org, auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();

create trigger organizations_timezone before insert or update of timezone on public.organizations
  for each row execute function private.check_timezone();
create trigger memberships_timezone before insert or update of timezone on public.memberships
  for each row execute function private.check_timezone();

-- New sign-up -> profile row.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Email changed in Supabase Auth -> keep profile in sync.
create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- Role and status rules for member changes made from the app:
--   * nobody changes their own role or status
--   * only an owner can grant, remove or alter owner access
--   * a membership can't be moved to another person or company
create or replace function private.guard_membership_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor      uuid := auth.uid();
  actor_role public.member_role;
begin
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'A membership cannot be moved' using errcode = '42501';
  end if;

  -- SQL editor / service role (no signed-in user), or a trusted function.
  if actor is null or current_setting('app.trusted_member_change', true) = 'on' then
    return new;
  end if;

  select m.role into actor_role
  from public.memberships m
  where m.user_id = actor and m.organization_id = old.organization_id and m.status = 'active';

  if old.user_id = actor and (new.role <> old.role or new.status <> old.status) then
    raise exception 'You cannot change your own role or status' using errcode = '42501';
  end if;

  if (old.role = 'owner' or new.role = 'owner') and actor_role is distinct from 'owner' then
    raise exception 'Only the company owner can change owner access' using errcode = '42501';
  end if;

  return new;
end $$;

create trigger memberships_guard before update on public.memberships
  for each row execute function private.guard_membership_update();

create or replace function private.audit_membership_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.team_id is distinct from old.team_id then
    perform private.log_audit(
      new.organization_id, 'member.updated', 'membership', new.id,
      jsonb_build_object(
        'user_id', new.user_id,
        'role',    jsonb_build_object('from', old.role,    'to', new.role),
        'status',  jsonb_build_object('from', old.status,  'to', new.status),
        'team_id', jsonb_build_object('from', old.team_id, 'to', new.team_id)
      )
    );
  end if;
  return new;
end $$;

create trigger memberships_audit after update on public.memberships
  for each row execute function private.audit_membership_change();

-- New invitation: tidy the email, refuse existing members,
-- and cancel any older pending invite to the same address.
create or replace function private.prepare_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  new.invited_by := coalesce(new.invited_by, auth.uid());

  if exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = new.organization_id
      and p.email = new.email
      and m.status <> 'removed'
  ) then
    raise exception '% is already a member of this company', new.email using errcode = '23505';
  end if;

  update public.invitations
  set revoked_at = now()
  where organization_id = new.organization_id
    and email = new.email
    and accepted_at is null
    and revoked_at is null;

  return new;
end $$;

create trigger invitations_prepare before insert on public.invitations
  for each row execute function private.prepare_invitation();

create or replace function private.audit_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.log_audit(
    new.organization_id, 'member.invited', 'invitation', new.id,
    jsonb_build_object('email', new.email, 'role', new.role)
  );
  return new;
end $$;

create trigger invitations_audit after insert on public.invitations
  for each row execute function private.audit_invitation();

-- ---------------------------------------------------------------------
-- App functions (called from the dashboard with supabase.rpc)
-- ---------------------------------------------------------------------

-- Create a company and make the caller its owner.
create or replace function public.create_organization(
  p_name text,
  p_country_code text default 'NG',
  p_timezone text default 'Africa/Lagos'
) returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare
  uid       uuid := auth.uid();
  v_name    text := trim(coalesce(p_name, ''));
  v_country text := upper(coalesce(nullif(trim(p_country_code), ''), 'NG'));
  v_base    text;
  v_slug    text;
  org       public.organizations;
begin
  if uid is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;
  if exists (select 1 from public.memberships where user_id = uid and status <> 'removed') then
    raise exception 'You already belong to a company' using errcode = '23505';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Company name is too short' using errcode = '22023';
  end if;
  if not private.is_valid_timezone(p_timezone) then
    raise exception 'Unknown time zone: %', p_timezone using errcode = '22023';
  end if;

  v_base := coalesce(nullif(trim(both '-' from left(private.slugify(v_name), 40)), ''), 'company');
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.organizations (name, slug, country_code, timezone, billing_currency, created_by)
  values (v_name, v_slug, v_country, p_timezone,
          case when v_country = 'NG' then 'NGN' else 'USD' end, uid)
  returning * into org;

  insert into public.memberships (organization_id, user_id, role, timezone)
  values (org.id, uid, 'owner', p_timezone);

  perform private.log_audit(org.id, 'organization.created', 'organization', org.id,
                            jsonb_build_object('name', org.name));
  return org;
end $$;

-- Public preview of an invite link (works before the person signs up).
create or replace function public.get_invitation(p_token text)
returns table (organization_name text, email text, role public.member_role, status text)
language sql stable security definer set search_path = '' as $$
  select o.name,
         i.email,
         i.role,
         case
           when i.revoked_at  is not null then 'revoked'
           when i.accepted_at is not null then 'accepted'
           when i.expires_at  < now()     then 'expired'
           else 'pending'
         end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token;
$$;

-- Join a company with an invite token. The signed-in email must match.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  inv     public.invitations;
  v_email text;
  v_tz    text;
begin
  if uid is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;

  select * into inv from public.invitations where token = p_token for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.revoked_at is not null then
    raise exception 'This invitation was cancelled' using errcode = '22023';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invitation has already been used' using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invitation has expired. Ask your admin for a new one' using errcode = '22023';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = uid;
  if v_email is distinct from inv.email then
    raise exception 'This invitation was sent to %. Sign in with that email to accept it', inv.email
      using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships where user_id = uid and status <> 'removed') then
    raise exception 'You already belong to a company' using errcode = '23505';
  end if;

  select o.timezone into v_tz from public.organizations o where o.id = inv.organization_id;

  perform set_config('app.trusted_member_change', 'on', true);
  insert into public.memberships (organization_id, user_id, role, team_id, timezone)
  values (inv.organization_id, uid, inv.role, inv.team_id, v_tz)
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', team_id = excluded.team_id, joined_at = now();
  perform set_config('app.trusted_member_change', 'off', true);

  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;

  perform private.log_audit(inv.organization_id, 'member.joined', 'invitation', inv.id,
                            jsonb_build_object('email', inv.email, 'role', inv.role));
  return inv.organization_id;
end $$;

-- Invitations waiting for the signed-in person's email, so someone who
-- signs up without clicking the link still sees "Join Acme" on login.
create or replace function public.my_pending_invitations()
returns table (token text, organization_name text, role public.member_role, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.token, o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  join auth.users u on u.id = auth.uid()
  where i.email = lower(u.email)
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc;
$$;

-- Workers set their own time zone (staff abroad), nothing else.
create or replace function public.update_my_timezone(p_timezone text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'You need to sign in first' using errcode = '28000';
  end if;
  if not private.is_valid_timezone(p_timezone) then
    raise exception 'Unknown time zone: %', p_timezone using errcode = '22023';
  end if;
  update public.memberships
  set timezone = p_timezone
  where user_id = auth.uid() and status = 'active';
end $$;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.teams         enable row level security;
alter table public.memberships   enable row level security;
alter table public.invitations   enable row level security;
alter table public.audit_logs    enable row level security;

-- organizations
create policy "members read their company" on public.organizations
  for select to authenticated
  using (id = (select private.current_org_id()));

create policy "admins update their company" on public.organizations
  for update to authenticated
  using (id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (id = (select private.current_org_id()));

-- profiles
create policy "read own and colleagues' profiles" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and m.organization_id = (select private.current_org_id())
    )
  );

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships
create policy "read company members and own membership" on public.memberships
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    or user_id = (select auth.uid())
  );

create policy "admins update members" on public.memberships
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

-- teams
create policy "members read teams" on public.teams
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy "admins create teams" on public.teams
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

create policy "admins update teams" on public.teams
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

create policy "admins delete teams" on public.teams
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

-- invitations
create policy "admins read invitations" on public.invitations
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

create policy "admins create invitations" on public.invitations
  for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and (select private.is_org_admin())
    and invited_by = (select auth.uid())
  );

create policy "admins revoke invitations" on public.invitations
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

-- audit_logs (written only by functions above)
create policy "admins read audit log" on public.audit_logs
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

-- ---------------------------------------------------------------------
-- Privileges: start from nothing, then grant exactly what the app needs.
-- (Supabase grants everything to anon/authenticated by default; RLS
-- filters rows, these grants limit which COLUMNS can be changed.)
-- ---------------------------------------------------------------------
revoke all on public.organizations, public.profiles, public.teams,
              public.memberships, public.invitations, public.audit_logs
  from anon, authenticated;

grant select on public.organizations, public.profiles, public.teams,
                public.memberships, public.audit_logs
  to authenticated;

grant update (name, timezone, settings) on public.organizations to authenticated;
grant update (full_name, avatar_url)    on public.profiles      to authenticated;
grant update (role, status, team_id, job_title, timezone, expected_hours_per_day)
  on public.memberships to authenticated;
grant insert (organization_id, name, manager_id), update (name, manager_id), delete
  on public.teams to authenticated;

-- Admins see invitations but never choose the token or inviter themselves.
grant select (id, organization_id, email, role, team_id, token, invited_by,
              expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.invitations to authenticated;
grant insert (organization_id, email, role, team_id) on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;

-- Default company for inserts, so the app doesn't have to send it.
alter table public.teams       alter column organization_id set default private.current_org_id();
alter table public.invitations alter column organization_id set default private.current_org_id();
alter table public.invitations alter column invited_by      set default auth.uid();

-- Functions
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_org_id(),
                          private.current_member_role(),
                          private.is_org_admin()
  to authenticated;

revoke execute on function public.create_organization(text, text, text) from public, anon;
revoke execute on function public.accept_invitation(text)               from public, anon;
revoke execute on function public.get_invitation(text)                  from public;
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.accept_invitation(text)               to authenticated;
grant execute on function public.get_invitation(text)                  to anon, authenticated;

revoke execute on function public.my_pending_invitations() from public, anon;
revoke execute on function public.update_my_timezone(text) from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;
grant execute on function public.update_my_timezone(text) to authenticated;
