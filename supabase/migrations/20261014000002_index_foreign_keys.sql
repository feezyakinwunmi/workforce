-- Cover foreign keys so deletes and "set null" cascades stay fast as data grows.
create index if not exists memberships_org_team_idx     on public.memberships (organization_id, team_id);
create index if not exists invitations_org_team_idx     on public.invitations (organization_id, team_id);
create index if not exists teams_org_manager_idx        on public.teams (organization_id, manager_id);
create index if not exists invitations_invited_by_idx   on public.invitations (invited_by);
create index if not exists invitations_accepted_by_idx  on public.invitations (accepted_by);
create index if not exists audit_logs_actor_idx         on public.audit_logs (actor_id);
create index if not exists organizations_created_by_idx on public.organizations (created_by);
