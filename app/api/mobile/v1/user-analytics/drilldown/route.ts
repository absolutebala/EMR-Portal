import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getEngineerAnalyticsDrilldownCore, type AnalyticsMetric } from '@/lib/mobile/core/analytics'

const VALID_METRICS: AnalyticsMetric[] = ['assigned', 'resolved', 'reassigned', 'expenses', 'present', 'leave']

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const metric = searchParams.get('metric') as AnalyticsMetric | null
  if (!month || !metric || !VALID_METRICS.includes(metric)) {
    return NextResponse.json({ rows: [], error: 'Missing or invalid month/metric' }, { status: 400 })
  }

  return NextResponse.json(await getEngineerAnalyticsDrilldownCore(adminClient(), user.id, month, metric))
}
