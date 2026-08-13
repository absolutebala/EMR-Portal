-- The "Service Engineer" role was renamed to "Field Engineer" via the Roles UI
-- (roles-actions.ts renameRole), which only updates roles.name — it does not
-- cascade to profiles.role (no FK enforces the two stay in sync). Existing
-- users kept the old string, silently disappearing from every hardcoded
-- role = 'Service Engineer' filter in the app. Backfill them here.
update public.profiles
set role = 'Field Engineer'
where role = 'Service Engineer';
