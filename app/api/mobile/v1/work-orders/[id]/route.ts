import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMobileWorkOrderBasicCore, getMobileWorkOrderDetailCore } from '@/lib/mobile/core/workOrders'

// ?basic=1 returns only the work order + customer info (for the check-in/closure
// screens, which don't need checkin history/closures/previous visits — see
// getMobileWorkOrderBasicCore); default returns the full job-hub detail payload.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const admin = adminClient()
  const basic = req.nextUrl.searchParams.get('basic') === '1'
  const result = basic
    ? await getMobileWorkOrderBasicCore(admin, user.id, id)
    : await getMobileWorkOrderDetailCore(admin, user.id, id)
  return NextResponse.json(result)
}
