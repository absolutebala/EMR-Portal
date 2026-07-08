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
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.redirect(new URL('/login?notice=link-error', req.url))
  }

  // Clear any existing Supabase session cookies so Chrome's stale session
  // doesn't interfere with the recovery link verification
  const res = NextResponse.redirect(data.properties.action_link)
  const cookieName = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`
  res.cookies.delete(cookieName)

  return res
}
