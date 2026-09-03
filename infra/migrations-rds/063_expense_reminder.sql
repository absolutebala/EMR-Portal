-- Supports the mobile Expenses screen's pending-approval WhatsApp reminder: a new
-- campaign column for the message template, plus a per-engineer cooldown timestamp so
-- the "Remind" button can't be spammed (enforced server-side in sendExpenseReminderCore,
-- not just hidden client-side).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_campaign_expense_reminder text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS expense_reminder_sent_at timestamptz;
