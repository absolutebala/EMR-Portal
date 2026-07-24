import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mobile equivalent of the desktop (app)/layout.tsx must_change_password redirect gate —
// mobile has no shared layout guard (each page does its own auth check), so every
// mobile page that requires auth must also call this right after confirming the user
// is signed in. Without it, invited/reset field engineers who only ever use the PWA
// never clear must_change_password, which also hides their Last Login on the desktop
// Users page (that column is gated on !must_change_password).
export async function requireMobilePasswordChanged(sb: SupabaseClient, userId: string) {
  const { data: profile } = await sb.from('profiles').select('must_change_password').eq('id', userId).single()
  if (profile?.must_change_password) redirect('/mobile/change-password')
}
