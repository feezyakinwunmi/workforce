-- Index for the expense_claims → memberships foreign key (Supabase advisor).
create index if not exists expense_claims_org_user_idx on public.expense_claims (organization_id, user_id);
