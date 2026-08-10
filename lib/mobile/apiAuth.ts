import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxxxxxxxxxxxxx.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Bearer-token auth for the React Native app's REST routes (app/api/mobile/v1/*).
// Unlike the cookie-session flow (see lib/supabase/server.ts's getAuthedUser, which
// deliberately avoids re-verifying because proxy.ts already did a live check earlier
// in the same request), a bearer request has no upstream verification to lean on — it
// arrives at this route directly, so auth.getUser(token) here IS the live check. Do
// not "simplify" this to getSession()-style trust; there's nothing to trust yet.
export async function resolveBearerUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  if (!token) return null
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
