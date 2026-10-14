-- Notification kinds for payslips, expense claims and performance reviews.
-- In their own migration: a new enum value must be committed before anything uses it.

alter type public.notification_kind add value if not exists 'payslip';
alter type public.notification_kind add value if not exists 'expense_submitted';
alter type public.notification_kind add value if not exists 'expense_decided';
alter type public.notification_kind add value if not exists 'review';
