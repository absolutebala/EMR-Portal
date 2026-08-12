import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // ALB hits this every 15-30s — skip the Supabase Auth round-trip entirely rather
  // than paying it on every health-check poll for the lifetime of the deployment.
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xxxxxxxxxxxxxxxxxxxxxxxx.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder',
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Mobile PWA has its own auth guard per page/route and its own login screen
  const isMobilePublic = pathname.startsWith('/mobile') || pathname === '/sw.js' || pathname === '/manifest.webmanifest'

  // API routes handle their own auth (cookie-session via getAuthedUser, or bearer-token
  // via resolveBearerUser for the React Native app) and must return JSON, never a 302 —
  // a redirect response is useless to a fetch client and was actively breaking
  // unauthenticated hits to routes like the cron endpoint, which has no session cookie
  // at all and never got a chance to run its own logic before this block intercepted it.
  const isApiPath = pathname.startsWith('/api/')

  // The bare homepage must reach app/page.tsx even when signed out — it does its own
  // device check there (mobile UA -> /mobile/install, desktop -> /dashboard). Without
  // this exemption, every unauthenticated visit to "/" was bounced straight to /login
  // by this same block before that redirect logic ever got a chance to run, on both
  // desktop and mobile alike.
  if (!user && !isMobilePublic && !isApiPath && pathname !== '/' && !pathname.startsWith('/login') && !pathname.startsWith('/set-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
