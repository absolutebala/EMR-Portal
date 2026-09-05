-- Admin-triggered "update your app" prompt for the field-engineer mobile app.
-- play_store_url is the (editable) Google Play link the popup's "Update now" button
-- opens. update_prompt_message + _at are set each time an admin sends a prompt; the
-- mobile app compares update_prompt_at against the last one it dismissed, so a new send
-- re-shows the popup but a dismissed one doesn't nag.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS play_store_url TEXT,
  ADD COLUMN IF NOT EXISTS update_prompt_message TEXT,
  ADD COLUMN IF NOT EXISTS update_prompt_at TIMESTAMPTZ;
