-- Three smaller pieces:
-- 1. Closing a company. The owner closes it (typing its name to confirm); for 14 days nothing is
--    deleted and the owner can undo it, and nobody can clock in. After that a daily job on the server
--    (service role, /api/cron/company-cleanup) removes its files and deletes the company, which
--    removes all its data (every table cascades from organizations / memberships).
-- 2. Email settings: each person can turn off kinds of email (profiles.email_opt_out).
-- 3. Chat search: full-text search over the messages a person can read (RLS applies).

-- 1. Closing a company -------------------------------------------------
alter table public.organizations
  add column closing_at  timestamptz,
  add column purge_after timestamptz;

create or replace function public.close_company(p_confirm text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  o public.organizations;
  r record;
begin
  if private.current_member_role() is distinct from 'owner' then
    raise exception 'Only the owner can close the company' using errcode = '42501';
  end if;
  select * into o from public.organizations where id = private.current_org_id() for update;
  if lower(trim(coalesce(p_confirm, ''))) <> lower(trim(o.name)) then
    raise exception 'Type the company name exactly to confirm' using errcode = '22023';
  end if;
  if o.closing_at is not null then
    return o.purge_after;
  end if;
  update public.organizations set closing_at = now(), purge_after = now() + interval '14 days' where id = o.id;
  perform private.log_audit(o.id, 'company.closing', 'organization', o.id, jsonb_build_object('purge_after', now() + interval '14 days'));
  for r in select m.user_id from public.memberships m where m.organization_id = o.id and m.status = 'active' loop
    perform private.notify(o.id, r.user_id, 'announcement', o.name || ' is closing its account',
      'Its data will be deleted on ' || to_char(now() + interval '14 days', 'FMDD Mon YYYY') || '. Clocking in is switched off.',
      '/dashboard', null, auth.uid());
  end loop;
  return now() + interval '14 days';
end $$;

create or replace function public.reopen_company()
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id();
begin
  if private.current_member_role() is distinct from 'owner' then
    raise exception 'Only the owner can do this' using errcode = '42501';
  end if;
  update public.organizations set closing_at = null, purge_after = null
  where id = v_org and closing_at is not null and purge_after > now();
  if not found then
    raise exception 'The company is not closing' using errcode = '22023';
  end if;
  perform private.log_audit(v_org, 'company.reopened', 'organization', v_org, '{}'::jsonb);
end $$;

-- Nobody clocks in while a company is closing.
create or replace function private.member_can_track(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with lim as (select b.seat_limit from private.org_billing(p_org) b),
  ranked as (
    select m.user_id,
           row_number() over (order by (m.role = 'owner') desc, m.joined_at, m.id) as rn
    from public.memberships m
    where m.organization_id = p_org and m.status = 'active'
  )
  select not exists (select 1 from public.organizations o where o.id = p_org and o.closing_at is not null)
     and case
           when (select seat_limit from lim) is null then exists (select 1 from ranked where user_id = p_user)
           else coalesce((select rn <= (select seat_limit from lim) from ranked where user_id = p_user), false)
         end;
$$;

create or replace function private.agent_billing(p_org uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', b.tier,
    'can_track', private.member_can_track(p_org, p_user),
    'message', case
      when exists (select 1 from public.organizations o where o.id = p_org and o.closing_at is not null) then
        'Your company is closing its account, so clocking in is switched off.'
      when not private.member_can_track(p_org, p_user) then
        case b.tier
          when 'free' then 'Your company''s free plan covers ' || private.free_seats() || ' people. Ask your company admin to upgrade so you can clock in.'
          else 'Your company has paid for ' || b.seat_limit || ' people. Ask your company admin to add a seat for you so you can clock in.'
        end
      end)
  from private.org_billing(p_org) b;
$$;

-- For the clean-up job only (service role): every stored file of a company.
create or replace function public.company_files(p_org uuid)
returns table (bucket_id text, name text) language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id in ('chat-files', 'screenshots', 'expense-receipts', 'staff-documents')
    and o.name like p_org::text || '/%';
$$;

revoke execute on function public.close_company(text), public.reopen_company() from public, anon;
grant execute on function public.close_company(text), public.reopen_company() to authenticated;
revoke execute on function public.company_files(uuid) from public, anon, authenticated;
grant execute on function public.company_files(uuid) to service_role;

-- 2. Email settings ----------------------------------------------------
alter table public.profiles
  add column email_opt_out text[] not null default '{}'
    check (email_opt_out <@ array['tasks', 'payslips', 'billing', 'leave', 'expenses', 'reviews']::text[]);
grant update (email_opt_out) on public.profiles to authenticated;

-- 3. Chat search -------------------------------------------------------
alter table public.messages
  add column search tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored;
create index messages_search_idx on public.messages using gin (search);

-- Messages matching the words, newest first, only from chats the caller can read (RLS).
create or replace function public.search_messages(p_query text, p_limit integer default 50)
returns table (id uuid, channel_id uuid, author_id uuid, body text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.channel_id, m.author_id, m.body, m.created_at
  from public.messages m
  where m.deleted_at is null
    and char_length(trim(coalesce(p_query, ''))) >= 2
    and (m.search @@ websearch_to_tsquery('simple', p_query)
         or (char_length(trim(p_query)) between 2 and 40 and m.body ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%'))
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke execute on function public.search_messages(text, integer) from public, anon;
grant execute on function public.search_messages(text, integer) to authenticated;
