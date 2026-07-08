import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const base = req.nextUrl.origin

  if (!token) {
    return NextResponse.redirect(`${base}/login?notice=invalid-link`)
  }

  const supabase = adminClient()

  // Look up the profile by its stable activation token
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, activation_token')
    .eq('activation_token', token)
    .maybeSingle()

  if (!profile) {
    // Token is NULL (already activated) or doesn't exist at all
    return NextResponse.redirect(`${base}/login?notice=already-active`)
  }

  // Generate a fresh one-time Supabase recovery link
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || base
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.redirect(`${base}/login?notice=link-error`)
  }

  return NextResponse.redirect(data.properties.action_link)
}
