'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { getDepartmentOpenCountsCore, getDepartmentOpenJobsCore, type DepartmentOpenCount, type DepartmentOpenJob } from '@/lib/mobile/core/dashboard'

export async function getDepartmentOpenCounts(): Promise<{ counts: DepartmentOpenCount[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { counts: [], error: 'Not authenticated' }
  return getDepartmentOpenCountsCore(adminClient())
}

export async function getDepartmentOpenJobs(department: string): Promise<{ jobs: DepartmentOpenJob[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { jobs: [], error: 'Not authenticated' }
  return getDepartmentOpenJobsCore(adminClient(), department)
}
