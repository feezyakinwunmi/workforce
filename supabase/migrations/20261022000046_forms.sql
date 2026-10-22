-- Workbase Forms: a form builder with optional Paystack payments, a separate product on the same
-- accounts (like Meet and Book).
--
-- A maker (any signed-in, non-guest account) builds forms: the questions are a JSON list (`fields`)
-- and the options a JSON object (`settings`); both are only read back by our own server code.
-- People who fill a form need no account. Answers come in ONLY through our server
-- (form_submit is service-role only), after a human check and the server's own validation of the
-- answers and the amount to pay (lib/forms/schema.ts). Money goes straight to the maker's bank
-- account (Paystack subaccount); Workbase keeps 3% (nothing for Book Pro subscribers).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create or replace function private.form_code()
returns text language sql volatile set search_path = '' as $$
  -- 8 characters from an alphabet without look-alikes (no 0/o, 1/l/i).
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::integer, 1), '')
  from generate_series(1, 8)
$$;

create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9]{8}$'),
  title       text not null default 'Untitled form' check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  fields      jsonb not null default '[]'::jsonb
                check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 60 and pg_column_size(fields) <= 120000),
  settings    jsonb not null default '{}'::jsonb
                check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 12000),
  published   boolean not null default false,
  accepting   boolean not null default true,
  responses   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index forms_owner_idx on public.forms (owner_id, updated_at desc);

create table public.form_responses (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references public.forms (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  answers       jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 60000),
  email         text check (email is null or char_length(email) <= 200),
  amount_kobo   integer not null default 0 check (amount_kobo = 0 or amount_kobo between 10000 and 1000000000),
  fee_kobo      integer not null default 0 check (fee_kobo >= 0),
  status        text not null check (status in ('received', 'pending_payment', 'paid')),
  pay_reference text unique,
  paid_at       timestamptz,
  page          text not null default '' check (char_length(page) <= 300),
  created_at    timestamptz not null default now()
);
create index form_responses_form_idx on public.form_responses (form_id, created_at desc);
create index form_responses_owner_idx on public.form_responses (owner_id);

-- Where a maker's money goes: written only by the server after Paystack accepts the account.
create table public.form_payouts (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  subaccount_code text not null,
  bank_name       text not null,
  account_last4   text not null,
  account_name    text not null,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
create or replace function private.guard_form()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Meet guests (anonymous sign-ins) can't make forms.
    if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
      raise exception 'Sign in with an account to make forms' using errcode = '42501';
    end if;
    new.responses := 0;
    new.slug := private.form_code();
  else
    new.owner_id := old.owner_id;
    new.slug := old.slug;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger forms_guard before insert or update on public.forms
  for each row execute function private.guard_form();
create trigger rate_forms before insert on public.forms
  for each row execute function private.rate_guard('forms', '30', '3600');

-- 3% to Workbase on payments; Book Pro subscribers pay nothing.
create or replace function private.form_fee_kobo(p_user uuid, p_amount integer)
returns integer language sql stable set search_path = '' as $$
  select case when p_amount <= 0 or private.book_tier(p_user) = 'pro' then 0 else ceil(p_amount * 0.03)::integer end
$$;

-- ---------------------------------------------------------------------------
-- RLS: makers see and change only their own forms; answers are read-only to them.
-- ---------------------------------------------------------------------------
alter table public.forms enable row level security;
alter table public.form_responses enable row level security;
alter table public.form_payouts enable row level security;

create policy forms_own_select on public.forms for select to authenticated using (owner_id = (select auth.uid()));
create policy forms_own_insert on public.forms for insert to authenticated with check (owner_id = (select auth.uid()));
create policy forms_own_update on public.forms for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy forms_own_delete on public.forms for delete to authenticated using (owner_id = (select auth.uid()));
create policy form_responses_own_select on public.form_responses for select to authenticated using (owner_id = (select auth.uid()));
create policy form_responses_own_delete on public.form_responses for delete to authenticated using (owner_id = (select auth.uid()));
create policy form_payouts_own_select on public.form_payouts for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.forms, public.form_responses, public.form_payouts from anon, authenticated;
grant select, delete on public.forms to authenticated;
grant insert (title, description, fields, settings) on public.forms to authenticated;
grant update (title, description, fields, settings, published, accepting) on public.forms to authenticated;
grant select, delete on public.form_responses to authenticated;
grant select on public.form_payouts to authenticated;

-- ---------------------------------------------------------------------------
-- Public side
-- ---------------------------------------------------------------------------
-- A published form, for its public page (anyone).
create or replace function public.form_public(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'slug', f.slug, 'title', f.title, 'description', f.description,
    'fields', f.fields, 'settings', f.settings, 'accepting', f.accepting
      and (coalesce((f.settings ->> 'max_responses')::integer, 0) <= 0
           or f.responses < (f.settings ->> 'max_responses')::integer),
    'payments', exists (select 1 from public.form_payouts p where p.user_id = f.owner_id),
    'pro', private.book_tier(f.owner_id) = 'pro')
  from public.forms f
  where f.slug = lower(p_slug) and f.published
$$;

-- A new answer. Server only: the server has already checked the person is human, validated the
-- answers against the form and worked out the amount (0 = nothing to pay).
create or replace function public.form_submit(p_slug text, p_answers jsonb, p_email text, p_amount_kobo integer,
  p_page text default '', p_ip text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  r public.form_responses;
  v_amount integer := coalesce(p_amount_kobo, 0);
  v_code text;
  v_max integer;
  v_ref text;
begin
  select * into f from public.forms where slug = lower(p_slug) and published for update;
  if not found then raise exception 'This form doesn''t exist or was taken down' using errcode = 'P0002'; end if;
  if not f.accepting then raise exception 'This form isn''t taking answers any more' using errcode = '55000'; end if;
  v_max := coalesce((f.settings ->> 'max_responses')::integer, 0);
  if v_max > 0 and f.responses >= v_max then
    raise exception 'This form has all the answers it needs' using errcode = '55000';
  end if;
  if v_amount not between 0 and 1000000000 or v_amount between 1 and 9999 then
    raise exception 'Online payments start at ₦100' using errcode = '22023';
  end if;
  if v_amount > 0 then
    select subaccount_code into v_code from public.form_payouts where user_id = f.owner_id;
    if v_code is null then
      raise exception 'This form can''t take payments yet. Please contact its owner.' using errcode = '55000';
    end if;
    if coalesce(p_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Enter a valid email address for your receipt' using errcode = '22023';
    end if;
  end if;
  -- Speed limits: per visitor per form, and per form.
  if coalesce(p_ip, '') <> '' then
    perform private.rate_limit('form_ip:' || f.id::text || ':' || left(p_ip, 64), 10, interval '10 minutes');
  end if;
  perform private.rate_limit('form:' || f.id::text, 600, interval '1 hour');

  v_ref := case when v_amount > 0 then 'form_' || replace(gen_random_uuid()::text, '-', '') end;
  insert into public.form_responses (form_id, owner_id, answers, email, amount_kobo, fee_kobo, status, pay_reference, page)
  values (f.id, f.owner_id, p_answers, nullif(lower(trim(coalesce(p_email, ''))), ''), v_amount,
    private.form_fee_kobo(f.owner_id, v_amount),
    case when v_amount > 0 then 'pending_payment' else 'received' end, v_ref, left(coalesce(p_page, ''), 300))
  returning * into r;
  if r.status = 'received' then
    update public.forms set responses = responses + 1 where id = f.id;
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'reference', r.pay_reference, 'amount_kobo', r.amount_kobo,
    'fee_kobo', r.fee_kobo, 'subaccount', v_code, 'email', r.email, 'owner', f.owner_id);
end $$;

-- After Paystack confirms a form payment (server only). Returns the response id, or null.
create or replace function public.form_confirm_payment(p_reference text, p_amount_kobo integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.form_responses;
begin
  select * into r from public.form_responses where pay_reference = p_reference for update;
  if not found or p_amount_kobo < r.amount_kobo then return null; end if;
  if r.status = 'paid' then return r.id; end if;
  update public.form_responses set status = 'paid', paid_at = now() where id = r.id;
  update public.forms set responses = responses + 1 where id = r.form_id;
  return r.id;
end $$;

-- After Paystack accepts the maker's bank account (server only).
create or replace function public.form_set_payout(p_user uuid, p_code text, p_bank text, p_last4 text, p_account_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.form_payouts (user_id, subaccount_code, bank_name, account_last4, account_name)
  values (p_user, p_code, left(p_bank, 80), left(p_last4, 4), left(p_account_name, 120))
  on conflict (user_id) do update set subaccount_code = excluded.subaccount_code, bank_name = excluded.bank_name,
    account_last4 = excluded.account_last4, account_name = excluded.account_name, updated_at = now();
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function private.form_code(), private.guard_form(), private.form_fee_kobo(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.form_public(text), public.form_submit(text, jsonb, text, integer, text, text),
  public.form_confirm_payment(text, integer), public.form_set_payout(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.form_public(text) to anon, authenticated;
grant execute on function public.form_submit(text, jsonb, text, integer, text, text),
  public.form_confirm_payment(text, integer), public.form_set_payout(uuid, text, text, text, text) to service_role;
