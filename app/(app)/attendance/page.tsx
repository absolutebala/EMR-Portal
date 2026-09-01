import { getAuthedUser } from '@/lib/cognito/server'
import { getAttendanceOverview, getAttendanceStats } from '@/app/actions/get-attendance'
import { getPendingAttendanceAmendments } from '@/app/actions/attendance'
import { getMyPermissions } from '@/app/actions/roles-actions'
import { getRange } from './dateRange'
import AttendancePageClient from './AttendancePageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function AttendancePage() {
  const user = await getAuthedUser()

  const defaultRange = getRange('week', new Date(), '', '')

  const [{ data: profile }, { rows, error }, { amendments }, { permissions, role }, { stats }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getAttendanceOverview(defaultRange.from, defaultRange.to),
    getPendingAttendanceAmendments(),
    getMyPermissions(),
    getAttendanceStats(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const canApprove = userRole === 'Super Admin' || userRole === 'Head of Service' || !hasPerms || permissions['Attendance — Approve'] === true

  return (
    <AttendancePageClient
      initialRows={rows}
      initialError={error}
      initialAmendments={amendments}
      stats={stats}
      canApprove={canApprove}
      userName={userName}
      userRole={userRole}
    />
  )
}
