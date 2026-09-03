'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/mobile/core/shared'
import {
  createWorkOrderMobileCore, createCustomerMobileCore,
  listCustomersForMobileCore, listTransformersForCustomerCore,
  type MobileCustomerOption, type MobileTransformerOption,
} from '@/lib/mobile/core/create-notification'
// Thin auth-resolution wrappers for the PWA (which calls server actions directly); the
// React Native app hits the same cores through app/api/mobile/v1/* REST routes.

export async function listCustomersMobile(): Promise<{ customers: MobileCustomerOption[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { customers: [], error: 'Not authenticated' }
  return listCustomersForMobileCore(adminClient())
}

export async function listTransformersForCustomer(customerId: string): Promise<{ transformers: MobileTransformerOption[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { transformers: [], error: 'Not authenticated' }
  return listTransformersForCustomerCore(adminClient(), customerId)
}

export async function createCustomerMobile(params: {
  name: string
  contactPerson: string
  phone: string
  type: 'sold' | 'shipped' | 'both'
  pincode: string
  siteName?: string | null
  serialNumber?: string | null
}): Promise<{ error: string | null; id?: string }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return createCustomerMobileCore(adminClient(), user.id, params)
}

export async function createNotificationMobile(params: {
  jobType: string
  customerId: string | null
  transformerIds: string[]
  notes: string | null
}): Promise<{ error: string | null; id?: string }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return createWorkOrderMobileCore(adminClient(), user.id, params)
}
