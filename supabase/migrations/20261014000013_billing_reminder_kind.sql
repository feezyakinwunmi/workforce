-- New notification type for plan reminders (its own migration: a new enum value must be
-- committed before an index or function body can use it).
alter type public.notification_kind add value if not exists 'billing';
