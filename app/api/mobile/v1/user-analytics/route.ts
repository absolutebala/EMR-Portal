import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getEngineerAnalyticsSummaryCore } from '@/lib/mobile/core/analytics'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || currentMonth()

  return NextResponse.json(await getEngineerAnalyticsSummaryCore(adminClient(), user.id, month))
}
