-- Nigerian payroll: statutory deductions and payslips.
--
-- payroll_settings: one row per company (owner/admin): whether to apply PAYE, pension and NHF to
--   naira pay, the pension and NHF rates, and how gross pay splits into basic, housing and transport
--   (pension is charged on basic + housing + transport, NHF on basic).
-- member_pay gains each person's tax details: statutory on/off (e.g. off for contractors),
--   yearly rent (rent relief = 20% of rent, at most ₦500,000) and other yearly reliefs
--   (health or life insurance premiums, mortgage interest), all declared in writing by the person.
-- payslips: one issued payslip per person per month. The amounts are worked out by the server
--   (lib/payroll.ts) and stored as a snapshot, so a payslip never changes when rates change later.
--   Owner/admins issue and read all; each person reads their own. Issuing notifies the person.

create table public.payroll_settings (
  organization_id      uuid primary key default private.current_org_id()
                         references public.organizations (id) on delete cascade,
  statutory            boolean not null default true,
  pension_employee_pct numeric(5,2) not null default 8 check (pension_employee_pct between 0 and 30),
  pension_employer_pct numeric(5,2) not null default 10 check (pension_employer_pct between 0 and 30),
  nhf                  boolean not null default false,
  nhf_pct              numeric(5,2) not null default 2.5 check (nhf_pct between 0 and 10),
  basic_pct            numeric(5,2) not null default 50 check (basic_pct between 1 and 100),
  housing_pct          numeric(5,2) not null default 25 check (housing_pct between 0 and 99),
  transport_pct        numeric(5,2) not null default 15 check (transport_pct between 0 and 99),
  updated_by           uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at           timestamptz not null default now(),
  constraint payroll_settings_split check (basic_pct + housing_pct + transport_pct <= 100)
);
create index payroll_settings_updated_by_idx on public.payroll_settings (updated_by);

create or replace function private.guard_payroll_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.organization_id := coalesce(private.current_org_id(), new.organization_id);
  new.updated_by := auth.uid();
  new.updated_at := now();
  perform private.log_audit(new.organization_id, 'payroll.settings_updated', 'organization', new.organization_id,
    jsonb_build_object('statutory', new.statutory, 'pension_employee_pct', new.pension_employee_pct,
                       'pension_employer_pct', new.pension_employer_pct, 'nhf', new.nhf, 'nhf_pct', new.nhf_pct,
                       'basic_pct', new.basic_pct, 'housing_pct', new.housing_pct, 'transport_pct', new.transport_pct));
  return new;
end $$;

create trigger payroll_settings_guard before insert or update on public.payroll_settings
  for each row execute function private.guard_payroll_settings();

alter table public.payroll_settings enable row level security;

create policy "admins read payroll settings" on public.payroll_settings
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins create payroll settings" on public.payroll_settings
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins change payroll settings" on public.payroll_settings
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

revoke all on public.payroll_settings from anon, authenticated;
grant select on public.payroll_settings to authenticated;
grant insert (statutory, pension_employee_pct, pension_employer_pct, nhf, nhf_pct, basic_pct, housing_pct, transport_pct),
      update (statutory, pension_employee_pct, pension_employer_pct, nhf, nhf_pct, basic_pct, housing_pct, transport_pct)
  on public.payroll_settings to authenticated;

-- Each person's tax details, next to their pay rate.
alter table public.member_pay
  add column statutory            boolean not null default true,
  add column annual_rent_minor    bigint  not null default 0 check (annual_rent_minor between 0 and 100000000000),
  add column annual_reliefs_minor bigint  not null default 0 check (annual_reliefs_minor between 0 and 100000000000);

create or replace function private.guard_member_pay()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.organization_id := coalesce(private.current_org_id(), new.organization_id);
  new.updated_by := auth.uid();
  new.updated_at := now();
  perform private.log_audit(new.organization_id, 'pay.updated', 'member', null,
    jsonb_build_object('user_id', new.user_id, 'basis', new.basis, 'amount_minor', new.amount_minor, 'currency', new.currency,
                       'statutory', new.statutory, 'annual_rent_minor', new.annual_rent_minor,
                       'annual_reliefs_minor', new.annual_reliefs_minor,
                       'previous', case when tg_op = 'UPDATE'
                                   then jsonb_build_object('basis', old.basis, 'amount_minor', old.amount_minor, 'currency', old.currency,
                                                           'statutory', old.statutory, 'annual_rent_minor', old.annual_rent_minor,
                                                           'annual_reliefs_minor', old.annual_reliefs_minor) end));
  return new;
end $$;

grant insert (statutory, annual_rent_minor, annual_reliefs_minor),
      update (statutory, annual_rent_minor, annual_reliefs_minor)
  on public.member_pay to authenticated;

-- Issued payslips.
create table public.payslips (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null default private.current_org_id(),
  user_id                uuid not null,
  month                  date not null check (extract(day from month) = 1),
  currency               text not null check (currency in ('NGN', 'USD')),
  gross_minor            bigint not null check (gross_minor between 0 and 100000000000),
  deductions_minor       bigint not null check (deductions_minor between 0 and 100000000000),
  net_minor              bigint not null,
  employer_pension_minor bigint not null default 0 check (employer_pension_minor >= 0),
  data                   jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 32000),
  issued_by              uuid references auth.users (id) on delete set null default auth.uid(),
  issued_at              timestamptz not null default now(),
  emailed_at             timestamptz,
  constraint payslips_net check (net_minor = gross_minor - deductions_minor),
  constraint payslips_one_per_month unique (organization_id, user_id, month),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index payslips_user_idx on public.payslips (user_id, month desc);
create index payslips_issued_by_idx on public.payslips (issued_by);

create or replace function private.guard_payslip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- Whose payslip and which month never change.
    new.organization_id := old.organization_id;
    new.user_id := old.user_id;
    new.month := old.month;
    if (new.gross_minor, new.deductions_minor, new.net_minor, new.data)
       is distinct from (old.gross_minor, old.deductions_minor, old.net_minor, old.data) then
      new.issued_by := auth.uid();
      new.issued_at := now();
      new.emailed_at := null;
    end if;
  else
    new.organization_id := coalesce(private.current_org_id(), new.organization_id);
    new.issued_by := auth.uid();
    new.issued_at := now();
    new.emailed_at := null;
  end if;
  return new;
end $$;

create trigger payslips_guard before insert or update on public.payslips
  for each row execute function private.guard_payslip();

create or replace function private.notify_payslip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.issued_at is not distinct from old.issued_at then
    return null; -- only the "emailed" mark changed
  end if;
  perform private.log_audit(new.organization_id, 'payslip.issued', 'member', null,
    jsonb_build_object('user_id', new.user_id, 'month', new.month, 'net_minor', new.net_minor, 'currency', new.currency,
                       'reissued', tg_op = 'UPDATE'));
  perform private.notify(
    new.organization_id, new.user_id, 'payslip',
    case when tg_op = 'UPDATE' then 'Your payslip was updated' else 'Your payslip is ready' end,
    to_char(new.month, 'FMMonth YYYY'),
    '/dashboard/payslips/' || new.id, null, auth.uid());
  return null;
end $$;

create trigger payslips_notify after insert or update on public.payslips
  for each row execute function private.notify_payslip();

alter table public.payslips enable row level security;

create policy "admins and the person read payslips" on public.payslips
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_org_admin()) or user_id = (select auth.uid())));
create policy "admins issue payslips" on public.payslips
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins reissue payslips" on public.payslips
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

revoke all on public.payslips from anon, authenticated;
grant select on public.payslips to authenticated;
grant insert (user_id, month, currency, gross_minor, deductions_minor, net_minor, employer_pension_minor, data),
      update (currency, gross_minor, deductions_minor, net_minor, employer_pension_minor, data, emailed_at)
  on public.payslips to authenticated;
