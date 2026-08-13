import { createClient } from '@supabase/supabase-js'

// TEMPORARY (Supabase migration Phase D0): existing files were already copied into
// S3/CloudFront and their URL columns rewritten (Phase C), but new uploads made by the
// app itself still go to Supabase Storage — swapping that to direct S3 uploads is a
// separate, self-contained follow-up, not part of the DB-layer (RDS/PostgREST)
// cutover this client was split out for. Only `.storage.*` calls should use this;
// `.from()` table queries go through lib/db/admin-client.ts instead.
export function storageAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
