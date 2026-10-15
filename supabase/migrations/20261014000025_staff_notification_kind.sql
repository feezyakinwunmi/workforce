-- Notification kind for staff records (e.g. someone changed their bank account).
-- Its own migration: a new enum value must be committed before it is used.
alter type public.notification_kind add value if not exists 'staff_record';
