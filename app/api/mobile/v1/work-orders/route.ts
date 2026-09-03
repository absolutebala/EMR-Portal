import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { createWorkOrderMobileCore } from '@/lib/mobile/core/create-notification'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { jobType, customerId, transformerIds, notes } = body as {
    jobType: string
    customerId: string | null
    transformerIds?: string[]
    notes?: string | null
  }

  const result = await createWorkOrderMobileCore(adminClient(), user.id, {
    jobType,
    customerId: customerId || null,
    transformerIds: transformerIds || [],
    notes: notes ?? null,
  })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
