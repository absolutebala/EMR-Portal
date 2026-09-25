export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileWorkOrderDetail } from '@/app/actions/mobile-actions'
import { getCurrentUserSummary } from '@/app/actions/get-current-user'
import JobDetailClient from './JobDetailClient'

const PHOTO_DELETE_ADMIN_ROLES = ['Super Admin', 'Head of Service', 'Service Manager']

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileWorkOrderDetailPage({ params }: Props) {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { id } = await params
  const [{ detail, error }, summary] = await Promise.all([
    getMobileWorkOrderDetail(id),
    getCurrentUserSummary(),
  ])

  if (error || !detail) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Notification not found'}
      </div>
    )
  }

  const isAdmin = !!summary && PHOTO_DELETE_ADMIN_ROLES.includes(summary.role)
  return <JobDetailClient detail={detail} currentUserId={user.id} isAdmin={isAdmin} />
}
