-- Bizz Padi: people's own pictures for flyers (26 Nov 2026).
--
-- A private Storage bucket "padi-media". Each person can only add, read and delete files in
-- their own folder: <user id>/<random>.jpg|png|webp. The flyer stores the path in
-- padi_posts.flyer.image; pages get a short-lived signed link to draw it.
-- Pictures are shrunk in the browser before upload (max 1600 px), so 5 MB is plenty.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('padi-media', 'padi-media', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy padi_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'padi-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

create policy padi_media_select on storage.objects for select to authenticated
  using (bucket_id = 'padi-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy padi_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'padi-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
