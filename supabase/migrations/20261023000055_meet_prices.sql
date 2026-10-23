-- Meet launch prices (Femi, 23 Oct 2026): Pro ₦3,000, Pro Max ₦6,000 per host per month.
create or replace function private.meet_price_kobo(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'pro' then 300000 when 'promax' then 600000 when 'business' then 3000000 when 'topup' then 100000 end
$$;
