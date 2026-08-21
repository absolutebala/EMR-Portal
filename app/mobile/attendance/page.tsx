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
  // in IST. Default range is the current work week, Monday through Saturday (Sunday
  // is always Weekly Off, so it's never fetched at all rather than shown as a dead
  // column) — date-only arithmetic in UTC on the date string avoids any local-TZ/DST
  // surprises, matching the pattern already used by eachDateStr/isSunday elsewhere in
  // this feature.
  const toStrToday = getISTDateStr()
  const todayUtc = new Date(`${toStrToday}T00:00:00Z`)
  const dow = todayUtc.getUTCDay() // 0 = Sunday
  const mondayUtc = new Date(todayUtc)
  mondayUtc.setUTCDate(todayUtc.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  const saturdayUtc = new Date(mondayUtc)
  saturdayUtc.setUTCDate(mondayUtc.getUTCDate() + 5)
  const fromStr = mondayUtc.toISOString().slice(0, 10)
  const toStr = saturdayUtc.toISOString().slice(0, 10)

  const { days, error } = await getAttendanceCalendar(fromStr, toStr)

  return <AttendanceView initialDays={days} initialError={error} todayStr={toStrToday} />
}
