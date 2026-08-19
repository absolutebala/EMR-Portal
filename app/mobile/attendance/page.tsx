export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getAttendanceCalendar } from '@/app/actions/attendance'
import { getISTDateStr } from '@/lib/mobile/core/attendance'
import AttendanceView from './AttendanceView'

export default async function MobileAttendancePage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  // Computed from the IST calendar date, not the server's own (UTC) local date
  // components — the 11am cutoff this whole feature is built around only makes sense
  // in IST.
  const toStr = getISTDateStr()
  const fromStr = new Date(new Date(`${toStr}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10)

  const { days, error } = await getAttendanceCalendar(fromStr, toStr)

  return <AttendanceView initialDays={days} initialError={error} todayStr={toStr} />
}
