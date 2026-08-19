import { getAuthedUser } from '@/lib/cognito/server'
import { getAttendanceGrid } from '@/app/actions/get-attendance'
import { getPendingAttendanceAmendments } from '@/app/actions/attendance'
import { getMyPermissions } from '@/app/actions/roles-actions'
import { getRange } from './dateRange'
import AttendancePageClient from './AttendancePageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function AttendancePage() {
  const user = await getAuthedUser()

  const defaultRange = getRange('week', new Date(), '', '')

  const [{ data: profile }, { engineers, dates, cells, error }, { amendments }, { permissions, role }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getAttendanceGrid(defaultRange.from, defaultRange.to),
    getPendingAttendanceAmendments(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const canApprove = userRole === 'Super Admin' || userRole === 'Head of Service' || !hasPerms || permissions['Attendance — Approve'] === true

  return (
    <AttendancePageClient
      initialEngineers={engineers}
      initialDates={dates}
      initialCells={cells}
      initialError={error}
      initialAmendments={amendments}
      canApprove={canApprove}
      userName={userName}
      userRole={userRole}
    />
  )
}
