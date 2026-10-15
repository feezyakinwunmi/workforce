-- Expense claims: a person photographs a receipt and claims the money back; their manager or an
-- admin approves it; approved claims are paid with the next payslip (added to net pay, untaxed).
--
-- Receipts live in the private Storage bucket "expense-receipts" at
--   <company id>/<user id>/<random id>/<file name>
-- People upload only to their own folder. A receipt can be opened by its owner and by managers
-- and admins who can see that person (private.visible_member_ids). A claim may only point at a
-- receipt its author uploaded; size and type come from Storage.
--
-- Status: pending → approved / rejected (decide_expense) → paid (when a payslip includes it).
-- The person can cancel a pending claim.

create table public.expense_claims (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  user_id         uuid not null default auth.uid(),
  title           text not null check (char_length(title) between 2 and 200),
  category        text not null default 'other'
                    check (category in ('transport', 'travel', 'meals', 'internet', 'equipment', 'office', 'other')),
  amount_minor    bigint not null check (amount_minor between 1 and 10000000000),
  currency        text not null default 'NGN' check (currency in ('NGN', 'USD')),
  spent_on        date not null,
  note            text check (char_length(note) <= 1000),
  receipt         jsonb check (receipt is null or jsonb_typeof(receipt) = 'object'),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'paid')),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text check (char_length(decision_note) <= 300),
  paid_month      date check (paid_month is null or extract(day from paid_month) = 1),
  payslip_id      uuid references public.payslips (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index expense_claims_org_status_idx on public.expense_claims (organization_id, status, created_at desc);
create index expense_claims_user_idx on public.expense_claims (user_id, created_at desc);
create index expense_claims_decided_by_idx on public.expense_claims (decided_by);
create index expense_claims_payslip_idx on public.expense_claims (payslip_id);

-- ---------------------------------------------------------------------
-- Receipts in Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Whose receipt a path is, or null if malformed or in another company.
create or replace function private.receipt_owner(p_name text)
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
revoke execute on function private.receipt_owner(text) from public, anon;
grant execute on function private.receipt_owner(text) to authenticated;

create policy "receipts: upload to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-receipts' and private.receipt_owner(name) = (select auth.uid()));
create policy "receipts: owner, their managers and admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-receipts'
         and (private.receipt_owner(name) = (select auth.uid())
              or ((select private.is_manager_or_admin())
                  and private.receipt_owner(name) = any ((select private.visible_member_ids())::uuid[]))));
create policy "receipts: owner removes unused ones" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-receipts' and private.receipt_owner(name) = (select auth.uid())
         and not exists (select 1 from public.expense_claims c
                         where c.receipt ->> 'path' = name and c.status in ('pending', 'approved', 'paid')));

-- ---------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------
create or replace function private.guard_expense()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb;
  v_path text;
begin
  if tg_op = 'INSERT' then
    new.organization_id := private.current_org_id();
    new.user_id := auth.uid();
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.paid_month := null;
    new.payslip_id := null;
    new.created_at := now();
    new.title := trim(new.title);
    new.note := nullif(trim(coalesce(new.note, '')), '');
    if new.spent_on > current_date + 1 or new.spent_on < current_date - 366 then
      raise exception 'The date must be within the last year' using errcode = '22023';
    end if;
    if new.receipt is not null then
      v_path := new.receipt ->> 'path';
      select o.metadata into v_meta from storage.objects o
      where o.bucket_id = 'expense-receipts' and o.name = v_path and o.owner_id = auth.uid()::text
        and private.receipt_owner(o.name) = auth.uid();
      if v_meta is null then
        raise exception 'The receipt was not found. Upload it again.' using errcode = '22023';
      end if;
      new.receipt := jsonb_build_object(
        'path', v_path,
        'name', left(coalesce(nullif(trim(new.receipt ->> 'name'), ''), split_part(v_path, '/', 4)), 200),
        'size', coalesce((v_meta ->> 'size')::bigint, 0),
        'type', coalesce(v_meta ->> 'mimetype', 'application/octet-stream'));
    end if;
  else
    -- Only these functions change a claim (they set app.expense_change); nothing else may.
    if coalesce(current_setting('app.expense_change', true), '') <> 'on' then
      raise exception 'Claims are changed through approve, reject or cancel' using errcode = '42501';
    end if;
    new.id := old.id;
    new.organization_id := old.organization_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create trigger expense_claims_guard before insert or update on public.expense_claims
  for each row execute function private.guard_expense();

-- Tell the people who can approve: owner/admins and the person's team manager.
create or replace function private.after_expense_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text := coalesce(private.person_name(new.user_id), 'Someone');
  r   record;
begin
  for r in
    select distinct m.user_id
    from public.memberships m
    where m.organization_id = new.organization_id and m.status = 'active' and m.user_id <> new.user_id
      and (m.role in ('owner', 'admin')
           or m.user_id = (select t.manager_id from public.memberships me
                           join public.teams t on t.id = me.team_id
                           where me.organization_id = new.organization_id and me.user_id = new.user_id))
  loop
    perform private.notify(new.organization_id, r.user_id, 'expense_submitted',
      who || ' claimed ' || case new.currency when 'NGN' then '₦' else '$' end ||
        trim(to_char(new.amount_minor / 100.0, 'FM999,999,999,990.00')),
      new.title, '/dashboard/expenses', null, new.user_id);
  end loop;
  return null;
end $$;

create trigger expense_claims_notify after insert on public.expense_claims
  for each row execute function private.after_expense_claim();

alter table public.expense_claims enable row level security;

create policy "see your claims and those of people you manage" on public.expense_claims
  for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (user_id = (select auth.uid())
              or ((select private.is_manager_or_admin()) and user_id = any ((select private.visible_member_ids())::uuid[]))));
create policy "claim for yourself" on public.expense_claims
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and user_id = (select auth.uid()));

revoke all on public.expense_claims from anon, authenticated;
grant select on public.expense_claims to authenticated;
grant insert (title, category, amount_minor, currency, spent_on, note, receipt) on public.expense_claims to authenticated;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.decide_expense(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.expense_claims;
begin
  select * into c from public.expense_claims
  where id = p_id and organization_id = private.current_org_id() for update;
  if not found then
    raise exception 'Claim not found' using errcode = '22023';
  end if;
  if not private.is_manager_or_admin() or not (c.user_id = any (private.visible_member_ids())) then
    raise exception 'Only this person''s manager or an admin can decide' using errcode = '42501';
  end if;
  if c.user_id = auth.uid() and private.current_member_role() <> 'owner' then
    raise exception 'Someone else has to approve your own claim' using errcode = '42501';
  end if;
  if c.status <> 'pending' then
    raise exception 'This claim was already %', c.status using errcode = '22023';
  end if;

  perform set_config('app.expense_change', 'on', true);
  update public.expense_claims
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(),
      decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
  where id = c.id;
  perform set_config('app.expense_change', '', true);

  perform private.log_audit(c.organization_id, case when p_approve then 'expense.approved' else 'expense.rejected' end,
    'member', null, jsonb_build_object('claim_id', c.id, 'user_id', c.user_id, 'amount_minor', c.amount_minor, 'currency', c.currency));
  perform private.notify(c.organization_id, c.user_id, 'expense_decided',
    'Your claim "' || left(c.title, 60) || '" was ' || case when p_approve then 'approved' else 'not approved' end,
    nullif(trim(coalesce(p_note, '')), ''), '/dashboard/expenses', null, auth.uid());
end $$;

create or replace function public.cancel_expense(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.expense_change', 'on', true);
  update public.expense_claims set status = 'cancelled'
  where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Only your own claims that are still waiting can be cancelled' using errcode = '22023';
  end if;
  perform set_config('app.expense_change', '', true);
end $$;

-- Payroll (owner/admin): mark approved claims as paid with a payslip. Called when payslips are
-- issued; re-issuing the month keeps the same claims on it.
create or replace function public.pay_expenses(p_payslip uuid, p_claim_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.payslips;
  n integer;
begin
  if not private.is_org_admin() then
    raise exception 'Only the owner and admins run payroll' using errcode = '42501';
  end if;
  select * into s from public.payslips where id = p_payslip and organization_id = private.current_org_id();
  if not found then
    raise exception 'Payslip not found' using errcode = '22023';
  end if;
  perform set_config('app.expense_change', 'on', true);
  update public.expense_claims
  set status = 'paid', paid_month = s.month, payslip_id = s.id
  where organization_id = s.organization_id and user_id = s.user_id and id = any (coalesce(p_claim_ids, '{}'))
    and (status = 'approved' or (status = 'paid' and payslip_id = s.id));
  get diagnostics n = row_count;
  -- Claims that were on this payslip but are no longer included go back to approved.
  update public.expense_claims
  set status = 'approved', paid_month = null, payslip_id = null
  where payslip_id = s.id and status = 'paid' and not (id = any (coalesce(p_claim_ids, '{}')));
  perform set_config('app.expense_change', '', true);
  return n;
end $$;

revoke execute on function public.decide_expense(uuid, boolean, text), public.cancel_expense(uuid),
                           public.pay_expenses(uuid, uuid[]) from public, anon;
grant execute on function public.decide_expense(uuid, boolean, text), public.cancel_expense(uuid),
                          public.pay_expenses(uuid, uuid[]) to authenticated;
