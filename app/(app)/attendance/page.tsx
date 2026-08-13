import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getAttendanceGrid } from '@/app/actions/get-attendance'
import { getRange } from './dateRange'
import AttendancePageClient from './AttendancePageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function AttendancePage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const defaultRange = getRange('week', new Date(), '', '')

  const [{ data: profile }, { engineers, dates, cells, error }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getAttendanceGrid(defaultRange.from, defaultRange.to),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return (
    <AttendancePageClient
      initialEngineers={engineers}
      initialDates={dates}
      initialCells={cells}
      initialError={error}
      userName={userName}
      userRole={userRole}
    />
  )
}
