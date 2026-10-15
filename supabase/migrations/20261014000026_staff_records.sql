-- Staff records: personal and employment details, bank and pension details, emergency contact,
-- documents (contracts, IDs) and a new-hire checklist.
--
-- Privacy: only the person and the company's owner/admins can see a record or its documents.
-- Managers don't (bank and ID details are not needed to manage work).
-- The person may edit their own contact, bank, pension and emergency details; employment
-- details (start date, type) are for owner/admins only. When someone changes their own bank
-- account, the owner/admins are told (a common payroll fraud is quietly swapping account numbers).

create table public.staff_profiles (
  organization_id        uuid not null default private.current_org_id(),
  user_id                uuid not null,
  phone                  text check (char_length(phone) <= 30),
  address                text check (char_length(address) <= 300),
  date_of_birth          date check (date_of_birth between '1900-01-01' and current_date),
  start_date             date,
  employment_type        text check (employment_type in ('full_time', 'part_time', 'contract', 'intern')),
  bank_name              text check (char_length(bank_name) <= 80),
  account_number         text check (account_number ~ '^[0-9]{6,20}$'),
  account_name           text check (char_length(account_name) <= 120),
  pension_pfa            text check (char_length(pension_pfa) <= 80),
  pension_pin            text check (char_length(pension_pin) <= 20),
  tax_id                 text check (char_length(tax_id) <= 20),
  emergency_name         text check (char_length(emergency_name) <= 120),
  emergency_relationship text check (char_length(emergency_relationship) <= 60),
  emergency_phone        text check (char_length(emergency_phone) <= 30),
  updated_by             uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at             timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index staff_profiles_user_idx on public.staff_profiles (user_id);
create index staff_profiles_updated_by_idx on public.staff_profiles (updated_by);

create or replace function private.guard_staff_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  admin boolean := private.is_org_admin();
  r record;
begin
  new.organization_id := coalesce(private.current_org_id(), new.organization_id);
  if not admin then
    if new.user_id is distinct from auth.uid() then
      raise exception 'You can only change your own record' using errcode = '42501';
    end if;
    -- Employment details are set by the company.
    if tg_op = 'INSERT' then
      new.start_date := null;
      new.employment_type := null;
    else
      new.start_date := old.start_date;
      new.employment_type := old.employment_type;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();

  if (tg_op = 'INSERT' and new.account_number is not null)
     or (tg_op = 'UPDATE' and (new.account_number, new.bank_name) is distinct from (old.account_number, old.bank_name)) then
    perform private.log_audit(new.organization_id, 'staff.bank_changed', 'member', null,
      jsonb_build_object('user_id', new.user_id, 'bank_name', new.bank_name,
                         'account_ending', right(new.account_number, 4), 'by_self', new.user_id = auth.uid()));
    if new.user_id = auth.uid() and (tg_op = 'UPDATE' and old.account_number is not null) then
      for r in
        select m.user_id from public.memberships m
        where m.organization_id = new.organization_id and m.status = 'active' and m.role in ('owner', 'admin')
      loop
        perform private.notify(new.organization_id, r.user_id, 'staff_record',
          coalesce(private.person_name(new.user_id), 'Someone') || ' changed their bank account',
          coalesce(new.bank_name, '') || ' ending ' || right(coalesce(new.account_number, ''), 4) || '. Check with them before the next payroll.',
          '/dashboard/records/' || new.user_id, null, auth.uid());
      end loop;
    end if;
  end if;
  return new;
end $$;

create trigger staff_profiles_guard before insert or update on public.staff_profiles
  for each row execute function private.guard_staff_profile();

alter table public.staff_profiles enable row level security;
create policy "the person and admins read records" on public.staff_profiles
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or (select private.is_org_admin())));
create policy "the person and admins add records" on public.staff_profiles
  for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (user_id = (select auth.uid()) or (select private.is_org_admin())));
create policy "the person and admins change records" on public.staff_profiles
  for update to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or (select private.is_org_admin())))
  with check (organization_id = (select private.current_org_id()));

revoke all on public.staff_profiles from anon, authenticated;
grant select on public.staff_profiles to authenticated;
grant insert (user_id, phone, address, date_of_birth, start_date, employment_type, bank_name, account_number, account_name,
              pension_pfa, pension_pin, tax_id, emergency_name, emergency_relationship, emergency_phone),
      update (phone, address, date_of_birth, start_date, employment_type, bank_name, account_number, account_name,
              pension_pfa, pension_pin, tax_id, emergency_name, emergency_relationship, emergency_phone)
  on public.staff_profiles to authenticated;

-- ---------------------------------------------------------------------
-- Documents (private bucket "staff-documents", path <company>/<person>/<random>/<file name>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-documents', 'staff-documents', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.staff_doc_owner(p_name text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  u constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or p_name !~ ('^' || u || '/' || u || '/' || u || '/[^/]{1,200}$') then
    return null;
  end if;
  if split_part(p_name, '/', 1)::uuid is distinct from private.current_org_id() then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end $$;
revoke execute on function private.staff_doc_owner(text) from public, anon;
grant execute on function private.staff_doc_owner(text) to authenticated;

create policy "staff documents: the person and admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-documents'
              and (private.staff_doc_owner(name) = (select auth.uid())
                   or ((select private.is_org_admin())
                       and exists (select 1 from public.memberships m
                                   where m.organization_id = (select private.current_org_id())
                                     and m.user_id = private.staff_doc_owner(name)))));
create policy "staff documents: the person and admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-documents'
         and (private.staff_doc_owner(name) = (select auth.uid())
              or ((select private.is_org_admin()) and private.staff_doc_owner(name) is not null)));
create policy "staff documents: uploader or admins remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-documents' and private.staff_doc_owner(name) is not null
         and ((select private.is_org_admin()) or owner_id = (select auth.uid())::text));

create table public.staff_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null,
  kind            text not null default 'other' check (kind in ('contract', 'id', 'certificate', 'other')),
  title           text not null check (char_length(title) between 1 and 200),
  file            jsonb not null check (jsonb_typeof(file) = 'object'),
  expires_on      date,
  uploaded_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index staff_documents_user_idx on public.staff_documents (organization_id, user_id, created_at desc);
create index staff_documents_uploaded_by_idx on public.staff_documents (uploaded_by);

create or replace function private.guard_staff_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_path text := new.file ->> 'path';
  v_meta jsonb;
begin
  new.organization_id := private.current_org_id();
  new.uploaded_by := auth.uid();
  new.created_at := now();
  if not private.is_org_admin() and new.user_id is distinct from auth.uid() then
    raise exception 'You can only add documents to your own record' using errcode = '42501';
  end if;
  select o.metadata into v_meta from storage.objects o
  where o.bucket_id = 'staff-documents' and o.name = v_path and o.owner_id = auth.uid()::text
    and private.staff_doc_owner(o.name) = new.user_id;
  if v_meta is null then
    raise exception 'The file was not found. Upload it again.' using errcode = '22023';
  end if;
  new.file := jsonb_build_object(
    'path', v_path,
    'name', left(coalesce(nullif(trim(new.file ->> 'name'), ''), split_part(v_path, '/', 4)), 200),
    'size', coalesce((v_meta ->> 'size')::bigint, 0),
    'type', coalesce(v_meta ->> 'mimetype', 'application/octet-stream'));
  perform private.log_audit(new.organization_id, 'staff.document_added', 'member', null,
    jsonb_build_object('user_id', new.user_id, 'kind', new.kind, 'title', new.title));
  return new;
end $$;

create trigger staff_documents_guard before insert on public.staff_documents
  for each row execute function private.guard_staff_document();

alter table public.staff_documents enable row level security;
create policy "the person and admins read documents" on public.staff_documents
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or (select private.is_org_admin())));
create policy "the person and admins add documents" on public.staff_documents
  for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (user_id = (select auth.uid()) or (select private.is_org_admin())));
create policy "uploader or admins remove documents" on public.staff_documents
  for delete to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_org_admin()) or uploaded_by = (select auth.uid())));

revoke all on public.staff_documents from anon, authenticated;
grant select, delete on public.staff_documents to authenticated;
grant insert (user_id, kind, title, file, expires_on) on public.staff_documents to authenticated;

-- ---------------------------------------------------------------------
-- New-hire checklist: a company template, copied for each person who joins.
-- ---------------------------------------------------------------------
create table public.onboarding_template (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id() references public.organizations (id) on delete cascade,
  title           text not null check (char_length(title) between 2 and 200),
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index onboarding_template_org_idx on public.onboarding_template (organization_id, position);

create table public.onboarding_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null,
  title           text not null check (char_length(title) between 2 and 200),
  position        integer not null default 0,
  done_at         timestamptz,
  done_by         uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index onboarding_tasks_user_idx on public.onboarding_tasks (organization_id, user_id, position);
create index onboarding_tasks_done_by_idx on public.onboarding_tasks (done_by);

create or replace function private.default_onboarding(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.onboarding_template (organization_id, title, position)
  select p_org, t.title, t.pos
  from (values ('Contract signed and uploaded', 1), ('ID document uploaded', 2), ('Bank details added', 3),
               ('Pension PFA and RSA PIN added', 4), ('Emergency contact added', 5),
               ('Desktop app installed and first clock-in', 6), ('Introduced to the team in chat', 7)) as t (title, pos)
  where not exists (select 1 from public.onboarding_template x where x.organization_id = p_org);
$$;

create or replace function private.after_org_onboarding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.default_onboarding(new.id);
  return null;
end $$;
create trigger organizations_default_onboarding after insert on public.organizations
  for each row execute function private.after_org_onboarding();

select private.default_onboarding(o.id) from public.organizations o;

-- Someone joins: give them the company checklist (not the owner who created the company).
create or replace function private.after_member_onboarding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> 'owner' then
    perform set_config('app.onboarding_seed', 'on', true);
    insert into public.onboarding_tasks (organization_id, user_id, title, position)
    select new.organization_id, new.user_id, t.title, t.position
    from public.onboarding_template t where t.organization_id = new.organization_id;
    perform set_config('app.onboarding_seed', '', true);
  end if;
  return null;
end $$;
create trigger memberships_onboarding after insert on public.memberships
  for each row execute function private.after_member_onboarding();

create or replace function private.guard_onboarding_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.onboarding_seed', true), '') = 'on' then
      null; -- copied from the template when someone joins
    elsif not private.is_org_admin() then
      raise exception 'Only the owner and admins add checklist items' using errcode = '42501';
    else
      new.organization_id := private.current_org_id();
    end if;
    new.done_at := null;
    new.done_by := null;
  else
    -- Owner/admins change anything; the person may only tick or untick their own items.
    if not private.is_org_admin() then
      if old.user_id is distinct from auth.uid() then
        raise exception 'Not your checklist' using errcode = '42501';
      end if;
      new.title := old.title;
      new.position := old.position;
    end if;
    new.user_id := old.user_id;
    new.organization_id := old.organization_id;
    if new.done_at is not null and old.done_at is null then
      new.done_at := now();
      new.done_by := auth.uid();
    elsif new.done_at is null then
      new.done_by := null;
    else
      new.done_at := old.done_at;
      new.done_by := old.done_by;
    end if;
  end if;
  return new;
end $$;
create trigger onboarding_tasks_guard before insert or update on public.onboarding_tasks
  for each row execute function private.guard_onboarding_task();

alter table public.onboarding_template enable row level security;
alter table public.onboarding_tasks enable row level security;

create policy "admins read the checklist template" on public.onboarding_template
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins add template items" on public.onboarding_template
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins change template items" on public.onboarding_template
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));
create policy "admins remove template items" on public.onboarding_template
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

create policy "the person and admins read checklists" on public.onboarding_tasks
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or (select private.is_org_admin())));
create policy "admins add checklist items" on public.onboarding_tasks
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "the person and admins tick items" on public.onboarding_tasks
  for update to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid()) or (select private.is_org_admin())))
  with check (organization_id = (select private.current_org_id()));
create policy "admins remove checklist items" on public.onboarding_tasks
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));

revoke all on public.onboarding_template, public.onboarding_tasks from anon, authenticated;
grant select, delete on public.onboarding_template, public.onboarding_tasks to authenticated;
grant insert (title, position), update (title, position) on public.onboarding_template to authenticated;
grant insert (user_id, title, position), update (title, position, done_at) on public.onboarding_tasks to authenticated;

-- Owner/admins: give an existing member the company checklist (items they already have are skipped).
create or replace function public.start_onboarding(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.is_org_admin() then
    raise exception 'Only the owner and admins can do this' using errcode = '42501';
  end if;
  insert into public.onboarding_tasks (organization_id, user_id, title, position)
  select m.organization_id, m.user_id, t.title, t.position
  from public.memberships m
  join public.onboarding_template t on t.organization_id = m.organization_id
  where m.organization_id = private.current_org_id() and m.user_id = p_user
    and not exists (select 1 from public.onboarding_tasks x
                    where x.organization_id = m.organization_id and x.user_id = m.user_id and x.title = t.title);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.start_onboarding(uuid) from public, anon;
grant execute on function public.start_onboarding(uuid) to authenticated;
