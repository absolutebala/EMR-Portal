import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/login?notice=invalid-link', req.url))
  }

  const supabase = adminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, activation_token')
    .eq('activation_token', token)
    .maybeSingle()

  if (!profile) {
    return NextResponse.redirect(new URL('/login?notice=already-active', req.url))
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    // redirectTo only used as fallback; we use hashed_token directly below
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (error || !data?.properties?.hashed_token) {
    return NextResponse.redirect(new URL('/login?notice=link-error', req.url))
  }

  // Pass the hashed_token directly to /set-password so the browser client
  // can call verifyOtp() without going through Supabase's redirect URL.
  // This avoids the Chrome session interference that caused the redirect loop.
  const dest = new URL('/set-password', req.url)
  dest.searchParams.set('token_hash', data.properties.hashed_token)
  dest.searchParams.set('type', 'recovery')

  // Clear any stale Supabase session cookie so old Chrome sessions don't interfere
  const res = NextResponse.redirect(dest)
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  res.cookies.delete(`sb-${projectRef}-auth-token`)

  return res
}
