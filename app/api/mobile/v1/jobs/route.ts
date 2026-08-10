import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMobileJobsListCore, getMobileWorkOrdersCore } from '@/lib/mobile/core/dashboard'

// ?scope=active returns only jobs still needing attention (mirrors getMobileWorkOrders,
// used e.g. by the product-request work-order picker); default returns every job
// regardless of status (mirrors getMobileJobsList, used by the Jobs tab).
export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const scope = req.nextUrl.searchParams.get('scope')
  const admin = adminClient()
  const result = scope === 'active'
    ? await getMobileWorkOrdersCore(admin, user.id)
    : await getMobileJobsListCore(admin, user.id)
  return NextResponse.json(result)
}
