-- New notification kind for @mentions in chat. Its own migration: a new enum value
-- must be committed before a function or index can use it.
alter type public.notification_kind add value if not exists 'mention';
