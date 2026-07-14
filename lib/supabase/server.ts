import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxxxxxxxxxxxxx.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder',
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// proxy.ts already re-verifies the session against Supabase's Auth server (a live
// network call) for every request, including every Server Action invocation — those
// are just POSTs that pass back through the same middleware. Calling auth.getUser()
// again here would be a second live verification of the same request. getSession()
// reads the already-proxy-verified session straight from the cookie, no network call,
// which is safe specifically because the caller is code running after proxy.ts in the
// same request lifecycle. Do not use this pattern in proxy.ts itself.
export async function getAuthedUser(sb: SupabaseClient): Promise<User | null> {
  const { data: { session } } = await sb.auth.getSession()
  return session?.user ?? null
}
