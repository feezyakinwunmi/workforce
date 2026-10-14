-- Removing chat files: whoever uploaded a file, or a company admin who can read that chat,
-- may remove it (the dashboard does this when a message is deleted).
create policy "chat files: uploader or admin removes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-files'
         and private.can_read_channel(private.chat_file_channel(name))
         and (owner_id = (select auth.uid())::text or (select private.is_org_admin())));
