-- Company logos: the owner or an admin uploads one (at sign-up or in Company settings); everyone
-- in the company sees it in the dashboard, and people invited see it on the invitation page.
-- Logos are public pictures (like a website logo), so the bucket is public; only the company's
-- owner/admins can add, replace or remove files in their company's folder. No SVG (it can carry script).

alter table public.organizations
  add column if not exists logo_path text
    check (logo_path is null or (split_part(logo_path, '/', 1) = id::text
           and logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'));

grant update (logo_path) on public.organizations to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy "company logos: read" on storage.objects for select to authenticated
  using (bucket_id = 'company-logos');
create policy "company logos: admins add" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos'
              and (storage.foldername(name))[1] = (select private.current_org_id())::text
              and (select private.is_org_admin()));
create policy "company logos: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'company-logos'
         and (storage.foldername(name))[1] = (select private.current_org_id())::text
         and (select private.is_org_admin()));
create policy "company logos: admins remove" on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos'
         and (storage.foldername(name))[1] = (select private.current_org_id())::text
         and (select private.is_org_admin()));

-- The invitation page (before joining) shows the company's logo.
create or replace function public.invitation_logo(p_token text)
returns text language sql stable security definer set search_path = '' as $$
  select o.logo_path from public.invitations i join public.organizations o on o.id = i.organization_id
  where i.token = p_token and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;
revoke execute on function public.invitation_logo(text) from public;
grant execute on function public.invitation_logo(text) to anon, authenticated;

-- Closed companies: their logo files are removed with everything else.
create or replace function public.company_files(p_org uuid)
returns table (bucket_id text, name text) language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id in ('chat-files', 'screenshots', 'expense-receipts', 'staff-documents', 'company-logos')
    and o.name like p_org::text || '/%';
$$;
revoke execute on function public.company_files(uuid) from public, anon, authenticated;
grant execute on function public.company_files(uuid) to service_role;
