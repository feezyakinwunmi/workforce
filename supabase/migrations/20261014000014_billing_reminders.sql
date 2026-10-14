-- Plan reminders: the owner and admins hear 7 days and 1 day before a paid plan or the
-- free trial ends (in the dashboard, as a desktop pop-up, and by email when SMTP is set up).
--
-- A daily pg_cron job writes the notifications. The dashboard's daily Vercel cron calls
-- claim_billing_emails() (service role only) to email each one exactly once.

alter table public.notifications add column if not exists emailed_at timestamptz;
create unique index if not exists notifications_billing_once
  on public.notifications (user_id, ref_date, title) where kind = 'billing';

create or replace function private.billing_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
  k integer;
begin
  with plan as (
    select o.id as org, b.tier,
           case when b.tier = 'standard' then b.paid_until when b.tier = 'trial' then b.trial_ends_at end as ends_at
    from public.organizations o
    cross join lateral private.org_billing(o.id) b
  ),
  due as (
    select p.org, p.tier, p.ends_at,
           ceil(extract(epoch from (p.ends_at - now())) / 86400)::int as days_left
    from plan p
    where p.ends_at is not null and p.ends_at > now()
  )
  insert into public.notifications (organization_id, user_id, kind, title, body, link, ref_date)
  select d.org, m.user_id, 'billing',
         case when d.tier = 'trial'
              then 'Your free trial ends ' || case when d.days_left = 1 then 'tomorrow' else 'in ' || d.days_left || ' days' end
              else 'Your plan ends ' || case when d.days_left = 1 then 'tomorrow' else 'in ' || d.days_left || ' days' end end,
         case when d.tier = 'trial'
              then 'After that your company moves to the Free plan (up to ' || private.free_seats() || ' people). Choose Standard to keep every feature.'
              else 'Renew to keep everyone tracking. People not covered by a plan can''t clock in.' end,
         '/dashboard/billing', d.ends_at::date
  from due d
  join public.memberships m on m.organization_id = d.org and m.status = 'active' and m.role in ('owner', 'admin')
  where d.days_left in (7, 1)
  on conflict (user_id, ref_date, title) where kind = 'billing' do nothing;
  get diagnostics k = row_count;
  n := n + k;
  return n;
end $$;

select cron.schedule('billing-reminders', '0 7 * * *', 'select private.billing_reminders()');

-- Server only: billing reminders not yet emailed, marked as emailed in the same step.
create or replace function public.claim_billing_emails()
returns table (email text, full_name text, title text, body text, link text)
language sql security definer set search_path = '' as $$
  update public.notifications n
  set emailed_at = now()
  from public.profiles p
  where p.id = n.user_id and n.kind = 'billing' and n.emailed_at is null
    and n.created_at > now() - interval '3 days'
  returning p.email, p.full_name, n.title, n.body, n.link;
$$;

revoke execute on function private.billing_reminders() from public, anon, authenticated;
revoke execute on function public.claim_billing_emails() from public, anon, authenticated;
grant execute on function public.claim_billing_emails() to service_role;
