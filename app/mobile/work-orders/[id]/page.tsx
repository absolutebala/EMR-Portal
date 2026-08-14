export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileWorkOrderDetail } from '@/app/actions/mobile-actions'
import JobDetailClient from './JobDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileWorkOrderDetailPage({ params }: Props) {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { id } = await params
  const { detail, error } = await getMobileWorkOrderDetail(id)

  if (error || !detail) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Notification not found'}
      </div>
    )
  }

  return <JobDetailClient detail={detail} />
}
