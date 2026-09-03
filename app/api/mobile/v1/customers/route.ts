import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { listCustomersForMobileCore, createCustomerMobileCore } from '@/lib/mobile/core/create-notification'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await listCustomersForMobileCore(adminClient())
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { name, contactPerson, phone, type, pincode, siteName, serialNumber } = body as {
    name: string
    contactPerson: string
    phone: string
    type: 'sold' | 'shipped' | 'both'
    pincode: string
    siteName?: string | null
    serialNumber?: string | null
  }

  const result = await createCustomerMobileCore(adminClient(), user.id, {
    name, contactPerson, phone, type, pincode, siteName: siteName ?? null, serialNumber: serialNumber ?? null,
  })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
