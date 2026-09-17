import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { updatePunchCategoryCore, type PunchCategory } from '@/lib/mobile/core/attendance'

// Change today's punch-in work category (the dashboard status chip) after punching in.
export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { category, visitCustomerName, visitSiteAddress, visitPurpose } = body as {
    category?: PunchCategory | null
    visitCustomerName?: string | null
    visitSiteAddress?: string | null
    visitPurpose?: string | null
  }

  const result = await updatePunchCategoryCore(adminClient(), user.id, { category: category ?? null, visitCustomerName, visitSiteAddress, visitPurpose })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
