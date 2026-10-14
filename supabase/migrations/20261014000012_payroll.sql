-- Pay rates for the payroll export.
-- One current rate per person: hourly or monthly, in naira or US dollars (minor units: kobo / cents).
-- Pay is sensitive: only the owner and admins can see or change rates; each person can see their own.
-- Every change is written to audit_logs.

create table public.member_pay (
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null,
  basis           text not null check (basis in ('hourly', 'monthly')),
  amount_minor    bigint not null check (amount_minor between 0 and 100000000000),
  currency        text not null default 'NGN' check (currency in ('NGN', 'USD')),
  updated_by      uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index member_pay_updated_by_idx on public.member_pay (updated_by);

create or replace function private.guard_member_pay()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.organization_id := coalesce(private.current_org_id(), new.organization_id);
  new.updated_by := auth.uid();
  new.updated_at := now();
  perform private.log_audit(new.organization_id, 'pay.updated', 'member', null,
    jsonb_build_object('user_id', new.user_id, 'basis', new.basis, 'amount_minor', new.amount_minor, 'currency', new.currency,
                       'previous', case when tg_op = 'UPDATE'
                                   then jsonb_build_object('basis', old.basis, 'amount_minor', old.amount_minor, 'currency', old.currency) end));
  return new;
end $$;

create trigger member_pay_guard before insert or update on public.member_pay
  for each row execute function private.guard_member_pay();

alter table public.member_pay enable row level security;

create policy "admins and the person read pay" on public.member_pay
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_org_admin()) or user_id = (select auth.uid())));
create policy "admins set pay" on public.member_pay
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_org_admin()));
create policy "admins change pay" on public.member_pay
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_org_admin()))
  with check (organization_id = (select private.current_org_id()));

revoke all on public.member_pay from anon, authenticated;
grant select on public.member_pay to authenticated;
grant insert (user_id, basis, amount_minor, currency), update (basis, amount_minor, currency)
  on public.member_pay to authenticated;
