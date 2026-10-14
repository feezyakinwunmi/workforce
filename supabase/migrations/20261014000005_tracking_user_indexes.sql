-- Cover user_id foreign keys (fast cascades when a user is deleted).
create index if not exists activity_blocks_user_idx on public.activity_blocks (user_id);
create index if not exists app_usage_user_idx       on public.app_usage (user_id);
create index if not exists idle_periods_user_idx    on public.idle_periods (user_id);
