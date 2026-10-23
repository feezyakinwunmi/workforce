-- Workbase Meet: no visible monthly limits for paying hosts (Femi, 23 Oct 2026).
--
-- Prices stay (Pro ₦4,000/host, Business ₦30,000 for 10 hosts); they pay for the video
-- (Cloudflare) and, later, AI summaries. The monthly allowance from 0052 becomes a hidden
-- fair-use ceiling that normal use never reaches; it only stops abuse:
--   * Free host:             100 person-hours a month (each meeting still 1 hour / 25 people)
--   * Meet Pro:              1,000 person-hours a month (≈ a 50-person meeting every working day)
--   * Workbase Standard/Pro: 50 per paid person (at least 200), shared by the company
--   * Meet Business:         3,000 shared by its 10 hosts
-- Above it, new meetings start with cameras off (sound and screen sharing still work); running
-- meetings are never cut. The owner console lists who gets close. Top-ups still work in the
-- database but aren't offered in the app.

create or replace function private.meet_org_included(p_org uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_seats integer := 0;
  v_wb boolean := false;
  v_biz boolean;
begin
  select b.tier in ('standard', 'pro'), b.paid_seats into v_wb, v_seats from private.org_billing(p_org) b;
  v_biz := exists (select 1 from public.meet_subscriptions s
                   where s.organization_id = p_org and s.plan = 'business' and s.status = 'success'
                     and s.period_start <= now() and s.period_end > now());
  return (case when coalesce(v_wb, false) then greatest(200, 50 * coalesce(v_seats, 0)) else 0 end
        + case when v_biz then 3000 else 0 end)::bigint * 3600;
end $$;

create or replace function private.meet_pool(p_user uuid)
returns table (pool text, tier text, included bigint, org uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_wb boolean;
  v_biz boolean;
  v_rank integer;
begin
  if private.meet_personal_pro(p_user) then
    return query select 'u:' || p_user::text, 'pro'::text, (1000 * 3600)::bigint, null::uuid;
    return;
  end if;
  select m.organization_id into v_org from public.memberships m where m.user_id = p_user and m.status = 'active' limit 1;
  if v_org is not null then
    v_wb := exists (select 1 from private.org_billing(v_org) b where b.tier in ('standard', 'pro'));
    v_biz := exists (select 1 from public.meet_subscriptions s
                     where s.organization_id = v_org and s.plan = 'business' and s.status = 'success'
                       and s.period_start <= now() and s.period_end > now());
    if v_biz and not v_wb then
      select r.rank into v_rank from (
        select m.user_id, row_number() over (order by (m.role = 'owner') desc, m.created_at, m.user_id) as rank
        from public.memberships m where m.organization_id = v_org and m.status = 'active'
      ) r where r.user_id = p_user;
    end if;
    if v_wb or (v_biz and v_rank <= 10) then
      return query select 'o:' || v_org::text, 'pro'::text, private.meet_org_included(v_org), v_org;
      return;
    end if;
  end if;
  return query select 'u:' || p_user::text, 'free'::text, (100 * 3600)::bigint, null::uuid;
end $$;

create or replace function private.meet_pool_included(p_pool text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := substr(p_pool, 3)::uuid;
begin
  if left(p_pool, 2) = 'o:' then return private.meet_org_included(v_id); end if;
  return case when private.meet_personal_pro(v_id) then 1000 * 3600 else 100 * 3600 end;
end $$;

revoke execute on function private.meet_org_included(uuid), private.meet_pool(uuid), private.meet_pool_included(text)
  from public, anon, authenticated;
