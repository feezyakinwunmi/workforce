-- Notification kind for "time to clock in / out" reminders (its own migration: a new enum value
-- must be committed before it is used).
alter type public.notification_kind add value if not exists 'clock_reminder';
