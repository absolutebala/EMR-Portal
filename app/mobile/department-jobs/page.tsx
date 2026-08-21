export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getDepartmentOpenJobs } from '@/app/actions/department-jobs'
import DepartmentJobsClient from './DepartmentJobsClient'

interface Props {
  searchParams: Promise<{ dept?: string }>
}

export default async function MobileDepartmentJobsPage({ searchParams }: Props) {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { dept } = await searchParams
  const department = dept || ''
  const { jobs, error } = department ? await getDepartmentOpenJobs(department) : { jobs: [], error: 'No department specified' }

  return <DepartmentJobsClient department={department} jobs={jobs} error={error} />
}
