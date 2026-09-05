export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getAttendanceCalendar } from '@/app/actions/attendance'
import { getISTDateStr } from '@/lib/mobile/core/attendance'
import { adminClient } from '@/lib/db/admin-client'
import AttendanceView from './AttendanceView'

export default async function MobileAttendancePage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { data: profile } = await adminClient().from('profiles').select('first_name,last_name').eq('id', user.id).single()
  const engineerName = profile ? `${profile.first_name} ${profile.last_name}` : 'Engineer'

  // Computed from the IST calendar date, not the server's own (UTC) local date
  // components — the 11am cutoff this whole feature is built around only makes sense
  // in IST. Default range is the current work week, Monday through Sunday (engineers
  // may work any day, so no day is treated as an off day) — date-only arithmetic in
  // UTC on the date string avoids any local-TZ/DST surprises, matching the pattern
  // already used by eachDateStr elsewhere in this feature.
  const toStrToday = getISTDateStr()
  const todayUtc = new Date(`${toStrToday}T00:00:00Z`)
  const dow = todayUtc.getUTCDay() // 0 = Sunday
  const mondayUtc = new Date(todayUtc)
  mondayUtc.setUTCDate(todayUtc.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  const sundayUtc = new Date(mondayUtc)
  sundayUtc.setUTCDate(mondayUtc.getUTCDate() + 6)
  const fromStr = mondayUtc.toISOString().slice(0, 10)
  const toStr = sundayUtc.toISOString().slice(0, 10)

  const { days, error } = await getAttendanceCalendar(fromStr, toStr)

  return <AttendanceView initialDays={days} initialError={error} todayStr={toStrToday} engineerName={engineerName} />
}
