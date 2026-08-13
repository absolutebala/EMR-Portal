import { PostgrestClient } from '@supabase/postgrest-js'

// Self-hosted PostgREST in front of RDS (Supabase migration Phase D0) — the app's
// .from()/.select() call sites (including nested-relation embeds) are unchanged from
// Supabase's query builder syntax, since @supabase/supabase-js's .from() already
// delegates to this same underlying library. Internal-only (Cloud Map DNS inside the
// VPC, no public route) — reachable only from the app's own ECS task.
//
// One client for everything, no separate "anon" vs "service-role" split: RLS was
// dropped when the schema was replayed onto RDS (Phase B decision) because the app's
// real authorization boundary was already app-layer code, not Postgres RLS, so there's
// no meaningful distinction left between a privileged and unprivileged DB role here.
const POSTGREST_URL = process.env.POSTGREST_URL || 'http://postgrest.emr-portal.local:3000'

export function adminClient() {
  return new PostgrestClient(POSTGREST_URL)
}
