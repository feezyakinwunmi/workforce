-- Workbase Forms: tell the maker about each new answer exactly once (the Paystack callback page
-- and the webhook can both confirm the same payment).
alter table public.form_responses add column notified_at timestamptz;

-- Server only: true the first time it's called for an answer that's ready (received or paid).
create or replace function public.form_claim_notify(p_response uuid)
returns boolean language sql security definer set search_path = '' as $$
  with c as (
    update public.form_responses set notified_at = now()
    where id = p_response and notified_at is null and status in ('received', 'paid')
    returning 1
  )
  select exists (select 1 from c)
$$;
revoke execute on function public.form_claim_notify(uuid) from public, anon, authenticated;
grant execute on function public.form_claim_notify(uuid) to service_role;
