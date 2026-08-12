import { NextResponse } from 'next/server'

// ALB target group health check target — deliberately does nothing but confirm the
// Node process is up and routing requests. Already exempt from proxy.ts's auth
// redirect (it exempts all of /api/*), so this responds even to an unauthenticated
// health-check probe.
export async function GET() {
  return NextResponse.json({ ok: true })
}
