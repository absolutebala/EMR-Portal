import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient, type EngineerStatusValue } from '@/lib/mobile/core/shared'
import { getEngineerStatusPromptCore, setEngineerStatusCore } from '@/lib/mobile/core/dashboard'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json(await getEngineerStatusPromptCore(adminClient(), user.id))
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { status, workOrderId, startByTime, currentLat, currentLng } = body as {
    status: EngineerStatusValue
    workOrderId?: string | null
    startByTime?: string | null
    currentLat?: number | null
    currentLng?: number | null
  }
  if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 })

  const result = await setEngineerStatusCore(adminClient(), user.id, status, workOrderId, startByTime, currentLat, currentLng)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
