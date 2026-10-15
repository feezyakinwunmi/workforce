-- Workbase Meet guests sign in "anonymously" (no email) just to join a meeting.
-- They must never become part of a Workbase company: no creating companies, no joining one.
-- Every way into a company inserts a membership, so one check here covers them all
-- (create_organization, accept_invitation and anything added later).

create or replace function private.block_guest_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users u where u.id = new.user_id and coalesce(u.is_anonymous, false)) then
    raise exception 'Guest accounts can''t join a company. Sign up with your email first.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists memberships_no_guests on public.memberships;
create trigger memberships_no_guests before insert on public.memberships
  for each row execute function private.block_guest_membership();

revoke execute on function private.block_guest_membership() from public, anon, authenticated;
