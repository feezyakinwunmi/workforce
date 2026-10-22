-- Workbase Forms: edit answers after sending, Google Sheets sync (Pro), file storage limits.
--
-- Edit after submit: when a form allows it, each answer gets a private 64-hex edit_token; whoever
-- holds the link can change that answer while the form is open. All through our server (service
-- role) after the same checks as a new answer; a paid answer can't change its amount.
-- Sheets: the maker connects Google once (refresh token, encrypted by the website before it is
-- stored; only the service role reads it), each connected form has a spreadsheet; rows are added
-- or updated by the website, and anything not synced yet is retried by the nightly job.
-- Storage: files a maker's forms hold are capped (500 MB Free, 10 GB Pro).

alter table public.form_responses
  add column edit_token text unique check (edit_token is null or edit_token ~ '^[0-9a-f]{64}$'),
  add column edited_at timestamptz,
  add column edits integer not null default 0,
  add column sheet_row integer,
  add column sheet_synced_at timestamptz;

-- The maker never needs the edit link of someone else's answer: hide that column from them.
revoke select on public.form_responses from authenticated;
grant select (id, form_id, owner_id, answers, email, amount_kobo, fee_kobo, status, pay_reference, paid_at, page,
  created_at, notified_at, edited_at, edits, sheet_row, sheet_synced_at) on public.form_responses to authenticated;

-- Server only: give an answer its edit link (when the form allows editing).
create or replace function public.form_issue_edit_token(p_response uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  update public.form_responses r set edit_token = coalesce(r.edit_token, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  from public.forms f
  where r.id = p_response and f.id = r.form_id and (f.settings ->> 'allow_edit')::boolean is true
  returning r.edit_token into v;
  return v;
end $$;

-- Server only: an answer by its edit link, if it can still be changed.
create or replace function public.form_edit_get(p_slug text, p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'answers', r.answers, 'amount_kobo', r.amount_kobo, 'status', r.status, 'edited_at', r.edited_at)
  from public.form_responses r join public.forms f on f.id = r.form_id
  where f.slug = lower(p_slug) and r.edit_token = p_token and f.published and f.accepting
    and (f.settings ->> 'allow_edit')::boolean is true and r.status in ('received', 'paid')
$$;

-- Server only: save the changed answer. Files must be this answer's own, or new uploads for this form.
create or replace function public.form_update_response(p_slug text, p_token text, p_answers jsonb, p_email text,
  p_amount_kobo integer, p_files text[], p_ip text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  f public.forms;
  r public.form_responses;
  v_new text[];
begin
  select * into f from public.forms where slug = lower(p_slug) and published;
  if not found or not f.accepting or (f.settings ->> 'allow_edit')::boolean is not true then
    raise exception 'This answer can''t be changed any more' using errcode = '55000';
  end if;
  select * into r from public.form_responses where form_id = f.id and edit_token = p_token for update;
  if not found or r.status not in ('received', 'paid') then
    raise exception 'This edit link isn''t valid' using errcode = 'P0002';
  end if;
  perform private.rate_limit('form_edit:' || r.id::text, 20, interval '1 hour');
  if coalesce(p_amount_kobo, 0) <> r.amount_kobo then
    raise exception 'These changes would change the amount paid. Please contact the form''s owner.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_files), 0) > 5 then raise exception 'Too many files' using errcode = '22023'; end if;
  -- New files = not already part of this answer.
  select coalesce(array_agg(p), '{}') into v_new from unnest(coalesce(p_files, '{}')) p
  where not exists (select 1 from jsonb_each(r.answers) e where jsonb_typeof(e.value) = 'object' and e.value ->> 'path' = p);
  if cardinality(v_new) > 0 and (select count(*) from public.form_uploads u
      where u.path = any(v_new) and u.form_id = f.id and u.response_id is null
        and exists (select 1 from storage.objects o where o.bucket_id = 'form-files' and o.name = u.path)) <> cardinality(v_new) then
    raise exception 'A file didn''t finish uploading. Please attach it again.' using errcode = '22023';
  end if;
  update public.form_uploads set response_id = r.id where path = any(v_new) and form_id = f.id;
  update public.form_responses set answers = p_answers, email = nullif(lower(trim(coalesce(p_email, ''))), ''),
    edited_at = now(), edits = edits + 1, sheet_synced_at = null
  where id = r.id;
  return r.id;
end $$;

-- File storage per maker.
create or replace function private.form_storage_limit(p_user uuid)
returns bigint language sql stable set search_path = '' as $$
  select case when private.book_tier(p_user) = 'pro' then 10737418240 else 524288000 end
$$;
create or replace function private.form_storage_used(p_user uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
  from storage.objects o join public.forms f on f.id::text = split_part(o.name, '/', 1)
  where o.bucket_id = 'form-files' and f.owner_id = p_user
$$;

-- form_upload_start with the file size: refuses when the maker's storage is full.
create or replace function public.form_upload_start(p_slug text, p_field text, p_path text, p_ip text, p_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.forms where slug = lower(p_slug);
  if v_owner is not null and private.form_storage_used(v_owner) + greatest(coalesce(p_size, 0), 0) > private.form_storage_limit(v_owner) then
    raise exception 'This form can''t take more files right now. Please tell its owner.' using errcode = '53100';
  end if;
  return public.form_upload_start(p_slug, p_field, p_path, p_ip);
end $$;

-- For the maker's plan box: storage used and allowed.
create or replace function public.form_my_storage()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('used', private.form_storage_used(auth.uid()), 'limit', private.form_storage_limit(auth.uid()))
  where auth.uid() is not null
$$;

-- Files no longer needed also include ones removed from an answer by an edit.
create or replace function public.form_stale_uploads(p_limit integer default 500)
returns setof text language sql stable security definer set search_path = '' as $$
  select u.path from public.form_uploads u
  where (u.response_id is null and u.created_at < now() - interval '1 day')
     or not exists (select 1 from public.forms f where f.id = u.form_id)
     or (u.response_id is not null and not exists (
           select 1 from public.form_responses r, jsonb_each(r.answers) e
           where r.id = u.response_id and jsonb_typeof(e.value) = 'object' and e.value ->> 'path' = u.path))
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;

-- ---------------------------------------------------------------------------
-- Google Sheets
-- ---------------------------------------------------------------------------
create table public.form_google_accounts (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  email             text not null default '',
  refresh_token_enc text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create table public.form_sheets (
  form_id         uuid primary key references public.forms (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  spreadsheet_id  text not null,
  sheet_url       text not null,
  connected_at    timestamptz not null default now(),
  last_synced_at  timestamptz,
  last_error      text
);
create index form_sheets_owner_idx on public.form_sheets (owner_id);
alter table public.form_google_accounts enable row level security;
alter table public.form_sheets enable row level security;
revoke all on public.form_google_accounts, public.form_sheets from anon, authenticated;
-- Makers see which Google account is connected (never the token) and their forms' sheets.
create policy form_google_own on public.form_google_accounts for select to authenticated using (user_id = (select auth.uid()));
grant select (user_id, email, created_at) on public.form_google_accounts to authenticated;
create policy form_sheets_own on public.form_sheets for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.form_sheets to authenticated;

-- Server only: answers waiting to be added to (or updated in) a connected sheet.
create or replace function public.form_sheet_backlog(p_limit integer default 200)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.form_responses r join public.form_sheets s on s.form_id = r.form_id
  where r.status in ('received', 'paid') and r.sheet_synced_at is null and r.created_at > now() - interval '30 days'
  order by r.created_at limit least(greatest(coalesce(p_limit, 200), 1), 1000)
$$;

revoke execute on function public.form_issue_edit_token(uuid), public.form_edit_get(text, text),
  public.form_update_response(text, text, jsonb, text, integer, text[], text),
  private.form_storage_limit(uuid), private.form_storage_used(uuid),
  public.form_upload_start(text, text, text, text, bigint), public.form_stale_uploads(integer),
  public.form_sheet_backlog(integer), public.form_my_storage()
  from public, anon, authenticated;
grant execute on function public.form_issue_edit_token(uuid), public.form_edit_get(text, text),
  public.form_update_response(text, text, jsonb, text, integer, text[], text),
  public.form_upload_start(text, text, text, text, bigint), public.form_stale_uploads(integer),
  public.form_sheet_backlog(integer) to service_role;
grant execute on function public.form_my_storage() to authenticated;
