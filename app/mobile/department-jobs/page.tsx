export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getDepartmentOpenJobs } from '@/app/actions/department-jobs'
import DepartmentJobsClient from './DepartmentJobsClient'

interface Props {
  searchParams: Promise<{ dept?: string; name?: string }>
}

export default async function MobileDepartmentJobsPage({ searchParams }: Props) {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { dept, name } = await searchParams
  const departmentId = dept || ''
  const { jobs, error } = departmentId ? await getDepartmentOpenJobs(departmentId) : { jobs: [], error: 'No department specified' }

  return <DepartmentJobsClient department={name || 'Department'} jobs={jobs} error={error} />
}
