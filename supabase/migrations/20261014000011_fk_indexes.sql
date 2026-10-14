-- Covering indexes for composite foreign keys (Supabase performance advisor).
create index if not exists channel_members_org_channel_idx on public.channel_members (organization_id, channel_id);
create index if not exists leave_requests_org_user_idx on public.leave_requests (organization_id, user_id);
create index if not exists messages_org_channel_idx on public.messages (organization_id, channel_id);
