'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import {
  adminClient, reverseGeocodeCore,
  type MobileWorkOrder, type MobileWorkOrderWithCustomer, type MobileDashboardStats,
  type OverdueFollowUp, type EngineerStatusValue, type EngineerStatusPrompt,
  type NotStartedNotice, type MobileWorkOrderDetail, type CheckinDriftNotice,
} from '@/lib/mobile/core/shared'
import {
  getMobileWorkOrdersCore, getMobileDashboardDataCore, getOverdueFollowUpsCore, rescheduleFollowUpCore,
  getMobileJobsListCore, recordLastSeenCore, logLocationPingIssueCore, checkOpenVisitFollowUpCore,
  getEngineerStatusPromptCore, setEngineerStatusCore, checkNotStartedFollowUpCore, checkCheckinDriftCore,
  type AppUpdatePrompt, type EngineerStreak,
} from '@/lib/mobile/core/dashboard'
import { getNearbyEngineersCore, type NearbyEngineer } from '@/lib/mobile/core/nearby'
import { markProductReceivedCore, type PendingProductItem } from '@/lib/mobile/core/products'
import {
  getMobileWorkOrderBasicCore, getMobileWorkOrderDetailCore, getMobileWorkOrderWithFormCore,
} from '@/lib/mobile/core/workOrders'
import type { AttendanceEffectiveStatus } from '@/lib/mobile/core/attendance'
// NOTE: MobileWorkOrder, MobileWorkOrderWithCustomer, MobileDashboardStats,
// OverdueFollowUp, EngineerStatusValue, AssignableSite, EngineerStatusPrompt,
// NotStartedNotice, MobileWorkOrderDetail, MobileForm(+Section/Field/Table/Row) now
// live in lib/mobile/core/shared.ts — import them from there directly, not from this
// file. A `'use server'` module's server-action compiler tries to wire every
// top-level export (including type-only re-exports) into its action manifest, and
// type-only exports get erased at compile time, which breaks the build — so these
// types can no longer be re-exported here.

// ── Thin 'use server' wrappers: auth resolution only. All business logic lives in
// lib/mobile/core/*, shared with the React Native REST routes (app/api/mobile/v1/*)
// so nothing is duplicated between the PWA and the native app. ──────────────────────

export async function getMobileWorkOrders(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }
  return getMobileWorkOrdersCore(adminClient(), user.id)
}

export async function getMobileDashboardData(): Promise<{
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string } | null
  attendanceStatus: AttendanceEffectiveStatus
  pendingProducts: PendingProductItem[]
  updatePrompt: AppUpdatePrompt | null
  streak: EngineerStreak
  error: string | null
}> {
  const user = await getAuthedUser()
  if (!user) return { stats: { assigned: 0, inProgress: 0, needsReassignment: 0, completed: 0 }, recentJobs: [], engineer: null, attendanceStatus: { kind: 'pending' }, pendingProducts: [], updatePrompt: null, streak: { count: 0, days: [false, false, false, false, false] }, error: 'Not authenticated' }
  return getMobileDashboardDataCore(adminClient(), user.id)
}

// Other field engineers within a radius of the caller's current location — powers the
// PWA dashboard's Nearby Engineers strip (mirrors the native app).
export async function getNearbyEngineers(lat: number, lng: number, radiusKm: number): Promise<{ engineers: NearbyEngineer[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { engineers: [], error: 'Not authenticated' }
  return getNearbyEngineersCore(adminClient(), user.id, lat, lng, radiusKm)
}

// The one product-status change a field engineer can make: confirming receipt of a
// dispatched item from the dashboard's Product Requests card (mirrors the native app).
export async function markProductReceived(itemId: string): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return markProductReceivedCore(adminClient(), user.id, itemId)
}

// Check-in drift: is the engineer 2km+ from where they checked in while still "Reached"?
// Powers the PWA dashboard's drift banner, same as the native app.
export async function checkCheckinDrift(currentLat: number, currentLng: number): Promise<{ notice: CheckinDriftNotice | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { notice: null, error: 'Not authenticated' }
  return checkCheckinDriftCore(adminClient(), user.id, currentLat, currentLng)
}

export async function getOverdueFollowUps(): Promise<{ followUps: OverdueFollowUp[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { followUps: [], error: 'Not authenticated' }
  return getOverdueFollowUpsCore(adminClient(), user.id)
}

export async function rescheduleFollowUp(workOrderId: string, newDate: string, offSite?: boolean): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return rescheduleFollowUpCore(adminClient(), user.id, workOrderId, newDate, offSite)
}

export async function getMobileJobsList(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }
  return getMobileJobsListCore(adminClient(), user.id)
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string | null }> {
  return reverseGeocodeCore(lat, lng)
}

export async function recordLastSeen(lat: number, lng: number): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return recordLastSeenCore(adminClient(), user.id, lat, lng)
}

export async function logLocationPingIssue(reason: string): Promise<void> {
  const user = await getAuthedUser()
  logLocationPingIssueCore(user?.id ?? null, reason)
}

export async function checkOpenVisitFollowUp(): Promise<{ followUp: OverdueFollowUp | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { followUp: null, error: 'Not authenticated' }
  return checkOpenVisitFollowUpCore(adminClient(), user.id)
}

export async function getEngineerStatusPrompt(): Promise<{ prompt: EngineerStatusPrompt | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { prompt: null, error: 'Not authenticated' }
  return getEngineerStatusPromptCore(adminClient(), user.id)
}

export async function setEngineerStatus(
  status: EngineerStatusValue,
  workOrderId?: string | null,
  startByTime?: string | null,
  currentLat?: number | null,
  currentLng?: number | null
): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return setEngineerStatusCore(adminClient(), user.id, status, workOrderId, startByTime, currentLat, currentLng)
}

export async function checkNotStartedFollowUp(currentLat: number, currentLng: number): Promise<{ notice: NotStartedNotice | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { notice: null, error: 'Not authenticated' }
  return checkNotStartedFollowUpCore(adminClient(), user.id, currentLat, currentLng)
}

export async function getMobileWorkOrderBasic(woId: string): Promise<{ workOrder: MobileWorkOrderWithCustomer | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { workOrder: null, error: 'Not authenticated' }
  return getMobileWorkOrderBasicCore(adminClient(), user.id, woId)
}

export async function getMobileWorkOrderDetail(woId: string): Promise<{ detail: MobileWorkOrderDetail | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { detail: null, error: 'Not authenticated' }
  return getMobileWorkOrderDetailCore(adminClient(), user.id, woId)
}

// ── Not yet extracted (Phase 2/3 of the React Native migration) — still full
// server-action bodies, but now sourcing shared helpers from lib/mobile/core/shared
// instead of local duplicates. ───────────────────────────────────────────────────────

export async function getMobileWorkOrderWithForm(woId: string, viewSubmittedBy?: string, formId?: string) {
  const user = await getAuthedUser()
  if (!user) return { workOrder: null, form: null, existingSubmission: null, readOnly: false, viewedEngineerName: null, error: 'Not authenticated' }
  return getMobileWorkOrderWithFormCore(adminClient(), user.id, woId, viewSubmittedBy, formId)
}
