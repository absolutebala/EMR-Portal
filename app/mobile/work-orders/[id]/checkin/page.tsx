export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileWorkOrderBasic } from '@/app/actions/mobile-actions'
import CheckInView from './CheckInView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileCheckInPage({ params }: Props) {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { id } = await params
  const { workOrder, error } = await getMobileWorkOrderBasic(id)

  if (error || !workOrder) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Notification not found'}
      </div>
    )
  }

  return <CheckInView workOrder={workOrder} />
}
