'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/mobile/core/shared'
import {
  getMyAttendanceStatusCore, markAttendanceCore, updatePunchCategoryCore, markEndDayCore, markDayOffCore, cancelDayOffCore, getAttendanceCalendarCore,
  getPendingAmendmentsCore, approveRejectAmendmentCore, requestAttendanceAmendmentCore,
  applyForLeaveCore, getMyLeaveRequestsCore, getPendingLeaveRequestsCore, approveRejectLeaveCore,
  type AttendanceEffectiveStatus, type AttendanceCalendarDay, type PendingAmendment, type PunchCategory, type LeaveRequestItem,
} from '@/lib/mobile/core/attendance'
// Thin auth-resolution wrappers only — business logic lives in
// lib/mobile/core/attendance.ts, shared with the React Native REST routes
// (app/api/mobile/v1/attendance/*). Types are imported for local signatures only, not
// re-exported — a 'use server' file's compiler expects every top-level export to be an
// async function, and a type re-export breaks that.

export async function getMyAttendanceStatus(): Promise<{ status: AttendanceEffectiveStatus | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { status: null, error: 'Not authenticated' }
  return getMyAttendanceStatusCore(adminClient(), user.id)
}

export async function markAttendance(params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  reason?: string | null
  attendanceDate?: string
  category?: PunchCategory | null
  visitCustomerName?: string | null
  visitSiteAddress?: string | null
  visitPurpose?: string | null
}): Promise<{ error: string | null; needsApproval: boolean }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated', needsApproval: false }
  return markAttendanceCore(adminClient(), user.id, params)
}

export async function updatePunchCategory(params: {
  category: PunchCategory | null
  visitCustomerName?: string | null
  visitSiteAddress?: string | null
  visitPurpose?: string | null
}): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return updatePunchCategoryCore(adminClient(), user.id, params)
}

export async function markEndDay(params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  reason?: string | null
}): Promise<{ error: string | null; needsApproval: boolean }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated', needsApproval: false }
  return markEndDayCore(adminClient(), user.id, params)
}

export async function markDayOff(params: { attendanceDate?: string }): Promise<{ error: string | null; needsApproval: boolean }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated', needsApproval: false }
  return markDayOffCore(adminClient(), user.id, params ?? {})
}

export async function cancelDayOff(params: { attendanceDate?: string }): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return cancelDayOffCore(adminClient(), user.id, params ?? {})
}

export async function requestAttendanceAmendment(params: { attendanceDate: string; reason: string }): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return requestAttendanceAmendmentCore(adminClient(), user.id, params)
}

export async function getAttendanceCalendar(from: string, to: string): Promise<{ days: AttendanceCalendarDay[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { days: [], error: 'Not authenticated' }
  return getAttendanceCalendarCore(adminClient(), user.id, from, to)
}

export async function getPendingAttendanceAmendments(): Promise<{ amendments: PendingAmendment[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { amendments: [], error: 'Not authenticated' }
  return getPendingAmendmentsCore(adminClient())
}

export async function approveRejectAttendanceAmendment(attendanceId: string, decision: 'approved' | 'rejected'): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return approveRejectAmendmentCore(adminClient(), user.id, attendanceId, decision)
}

// ----- Apply for Leave -----
export async function applyForLeave(params: { fromDate: string; toDate: string; reason: string }): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return applyForLeaveCore(adminClient(), user.id, params)
}

export async function getMyLeaveRequests(): Promise<{ requests: LeaveRequestItem[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { requests: [], error: 'Not authenticated' }
  return getMyLeaveRequestsCore(adminClient(), user.id)
}

export async function getPendingLeaveRequests(): Promise<{ requests: LeaveRequestItem[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { requests: [], error: 'Not authenticated' }
  return getPendingLeaveRequestsCore(adminClient())
}

export async function approveRejectLeaveRequest(leaveRequestId: string, decision: 'approved' | 'rejected'): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return approveRejectLeaveCore(adminClient(), user.id, leaveRequestId, decision)
}
