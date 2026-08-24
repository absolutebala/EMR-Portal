import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getDepartmentOpenJobsCore } from '@/lib/mobile/core/dashboard'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dept = searchParams.get('dept')
  if (!dept) return NextResponse.json({ jobs: [], error: 'Missing dept' }, { status: 400 })

  return NextResponse.json(await getDepartmentOpenJobsCore(adminClient(), user.id, dept))
}
