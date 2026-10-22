-- Workbase Forms: is this maker on Pro (Book + Forms)? For the server's Google Sheets sync.
create or replace function public.form_owner_is_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.book_tier(p_user) = 'pro'
$$;
revoke execute on function public.form_owner_is_pro(uuid) from public, anon, authenticated;
grant execute on function public.form_owner_is_pro(uuid) to service_role;
