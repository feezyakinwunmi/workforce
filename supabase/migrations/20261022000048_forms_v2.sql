-- Workbase Forms v2: file uploads, plus Forms in the owner console.
--
-- Files: private bucket form-files, path <form id>/<upload id>/<file name>. People filling a form
-- have no account, so our server hands out one-time signed upload links (form_upload_start records
-- each one, with speed limits). On submit, form_submit (new version with p_files) checks every
-- file really was uploaded for this form, not used before, and is in Storage, then ties it to the
-- answer. Only the form's maker can download or delete its files. Uploads never sent with an
-- answer, and files of deleted answers or forms, are removed by the nightly clean-up (website,
-- service role) using form_uploads.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-files', 'form-files', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

-- The maker of the form a stored file belongs to (first path part = form id).
create or replace function private.form_file_owner(p_name text)
returns uuid language sql stable security definer set search_path = '' as $$
  select f.owner_id from public.forms f where f.id::text = split_part(p_name, '/', 1)
$$;
revoke execute on function private.form_file_owner(text) from public, anon;
grant execute on function private.form_file_owner(text) to authenticated;

create policy "form files: makers read their forms' files" on storage.objects
  for select to authenticated
  using (bucket_id = 'form-files' and private.form_file_owner(name) = (select auth.uid()));
create policy "form files: makers delete their forms' files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'form-files' and private.form_file_owner(name) = (select auth.uid()));

-- Every upload link handed out. No foreign keys on purpose: the clean-up finds files whose form
-- or answer is gone.
create table public.form_uploads (
  path        text primary key check (char_length(path) <= 200),
  form_id     uuid not null,
  response_id uuid,
  created_at  timestamptz not null default now()
);
create index form_uploads_form_idx on public.form_uploads (form_id);
create index form_uploads_unused_idx on public.form_uploads (created_at) where response_id is null;
alter table public.form_uploads enable row level security;
revoke all on public.form_uploads from anon, authenticated;

-- Server only: record an upload link for a published form's file question.
create or replace function public.form_upload_start(p_slug text, p_field text, p_path text, p_ip text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.forms;
begin
  select * into f from public.forms where slug = lower(p_slug) and published and accepting;
  if not found then raise exception 'This form isn''t taking answers' using errcode = 'P0002'; end if;
  if not exists (select 1 from jsonb_array_elements(f.fields) x where x ->> 'id' = p_field and x ->> 'type' = 'file') then
    raise exception 'This question doesn''t take files' using errcode = '22023';
  end if;
  if p_path !~ ('^' || f.id::text || '/[0-9a-f-]{36}/[A-Za-z0-9_. -]{1,80}$') then
    raise exception 'Bad file name' using errcode = '22023';
  end if;
  if coalesce(p_ip, '') <> '' then
    perform private.rate_limit('form_upload_ip:' || f.id::text || ':' || left(p_ip, 64), 20, interval '1 hour');
  end if;
  perform private.rate_limit('form_upload:' || f.id::text, 300, interval '1 hour');
  insert into public.form_uploads (path, form_id) values (p_path, f.id);
  return f.id;
end $$;

-- form_submit with files: the same rules as before, plus every file path must be an unused upload
-- for this form that is really in Storage. (The old 6-argument version stays for older pages.)
create or replace function public.form_submit(p_slug text, p_answers jsonb, p_email text, p_amount_kobo integer,
  p_page text, p_ip text, p_files text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_id uuid;
  v_n integer := coalesce(cardinality(p_files), 0);
  v_form uuid;
begin
  if v_n > 5 then raise exception 'Too many files' using errcode = '22023'; end if;
  if v_n > 0 then
    select f.id into v_form from public.forms f where f.slug = lower(p_slug);
    if (select count(*) from public.form_uploads u
        where u.path = any(p_files) and u.form_id = v_form and u.response_id is null
          and exists (select 1 from storage.objects o where o.bucket_id = 'form-files' and o.name = u.path)) <> v_n then
      raise exception 'A file didn''t finish uploading. Please attach it again.' using errcode = '22023';
    end if;
  end if;
  v := public.form_submit(p_slug, p_answers, p_email, p_amount_kobo, p_page, p_ip);
  v_id := (v ->> 'id')::uuid;
  if v_n > 0 then
    update public.form_uploads set response_id = v_id where path = any(p_files) and form_id = v_form;
  end if;
  return v;
end $$;

revoke execute on function public.form_upload_start(text, text, text, text),
  public.form_submit(text, jsonb, text, integer, text, text, text[]) from public, anon, authenticated;
grant execute on function public.form_upload_start(text, text, text, text),
  public.form_submit(text, jsonb, text, integer, text, text, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Owner console: Forms fees count as money in; a Forms tab.
-- ---------------------------------------------------------------------------
create or replace function private.admin_revenue()
returns table (product text, organization_id uuid, user_id uuid, reference text, amount_kobo bigint, paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'workbase_' || p.plan, p.organization_id, p.created_by, p.reference, p.amount_kobo, coalesce(p.paid_at, p.created_at)
    from public.payments p where p.status = 'success' and p.amount_kobo > 0
  union all
  select 'meet_' || s.plan, s.organization_id, s.user_id, s.reference, s.amount_kobo::bigint, coalesce(s.period_start, s.created_at)
    from public.meet_subscriptions s where s.status = 'success'
  union all
  select 'book_pro', null, s.user_id, s.reference, s.amount_kobo::bigint, coalesce(s.period_start, s.created_at)
    from public.book_subscriptions s where s.status = 'success'
  union all
  select 'book_fees', null, pg.owner_id, b.pay_reference, b.fee_kobo::bigint, b.paid_at
    from public.book_bookings b join public.book_pages pg on pg.id = b.page_id
    where b.paid_at is not null and b.fee_kobo > 0
  union all
  select 'forms_fees', null, r.owner_id, r.pay_reference, r.fee_kobo::bigint, r.paid_at
    from public.form_responses r where r.status = 'paid' and r.fee_kobo > 0
$$;

-- Forms numbers for the console. Never answers, emails or file names: only counts and money.
create or replace function public.admin_forms(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date := private.lagos_day(now()) - (v_days - 1);
  v_since timestamptz := (v_from::timestamp at time zone 'Africa/Lagos');
begin
  return jsonb_build_object(
    'days', v_days,
    'forms', (select jsonb_build_object(
                'total', count(*), 'live', count(*) filter (where f.published and f.accepting),
                'drafts', count(*) filter (where not f.published),
                'makers', count(distinct f.owner_id),
                'paid_forms', count(*) filter (where (f.settings -> 'payment' ->> 'enabled')::boolean),
                'new', count(*) filter (where f.created_at >= v_since))
              from public.forms f),
    'payouts', (select count(*) from public.form_payouts),
    'answers', (select jsonb_build_object(
                  'received', count(*) filter (where r.status <> 'pending_payment'),
                  'paid', count(*) filter (where r.status = 'paid'),
                  'unpaid', count(*) filter (where r.status = 'pending_payment'),
                  'embedded', count(*) filter (where r.page <> '' and r.status <> 'pending_payment'))
                from public.form_responses r where r.created_at >= v_since),
    'files', (select jsonb_build_object('count', count(*), 'bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0))
              from storage.objects o where o.bucket_id = 'form-files'),
    'money', (select jsonb_build_object(
                'paid_kobo', coalesce(sum(r.amount_kobo) filter (where r.paid_at >= v_since), 0),
                'fees_kobo', coalesce(sum(r.fee_kobo) filter (where r.paid_at >= v_since), 0),
                'fees_all_time_kobo', coalesce(sum(r.fee_kobo) filter (where r.status = 'paid'), 0))
              from public.form_responses r),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'answers', (select count(*) from public.form_responses r where r.status <> 'pending_payment' and private.lagos_day(r.created_at) = g.day),
        'paid_kobo', (select coalesce(sum(r.amount_kobo), 0) from public.form_responses r where r.status = 'paid' and private.lagos_day(r.paid_at) = g.day),
        'fees_kobo', (select coalesce(sum(r.fee_kobo), 0) from public.form_responses r where r.status = 'paid' and private.lagos_day(r.paid_at) = g.day)
      ) order by g.day)
      from (select generate_series(v_from, private.lagos_day(now()), interval '1 day')::date as day) g
    ),
    'form_list', coalesce((
      select jsonb_agg(x order by x.answers_period desc, x.created_at desc) from (
        select f.id, f.slug, f.title, f.published, f.accepting, f.created_at, f.responses as answers_total,
               coalesce(nullif(pr.full_name, ''), pr.email) as owner, pr.email as owner_email,
               (f.settings -> 'payment' ->> 'enabled')::boolean is true as takes_payments,
               exists (select 1 from public.form_payouts p where p.user_id = f.owner_id) as payouts,
               (select count(*) from public.form_responses r where r.form_id = f.id and r.created_at >= v_since and r.status <> 'pending_payment') as answers_period,
               (select coalesce(sum(r.amount_kobo), 0) from public.form_responses r where r.form_id = f.id and r.paid_at >= v_since) as paid_period_kobo,
               (select max(r.created_at) from public.form_responses r where r.form_id = f.id) as last_answer
        from public.forms f left join public.profiles pr on pr.id = f.owner_id
        limit 200) x), '[]'::jsonb)
  );
end $$;
revoke execute on function public.admin_forms(integer) from public, anon, authenticated;
grant execute on function public.admin_forms(integer) to service_role;
