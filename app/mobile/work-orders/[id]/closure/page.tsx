export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileWorkOrderBasic } from '@/app/actions/mobile-actions'
import { adminClient } from '@/lib/mobile/core/shared'
import ClosureView from './ClosureView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileClosurePage({ params }: Props) {
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

  // Whether this notification still has open product-request items — drives the
  // "create a follow-up notification?" prompt when the engineer marks it completed.
  let hasOpenProductRequest = false
  const admin = adminClient()
  const { data: reqs } = await admin.from('product_requests').select('id').eq('work_order_id', id)
  const reqIds = (reqs || []).map(r => r.id)
  if (reqIds.length) {
    const { data: openItems } = await admin.from('product_request_items').select('id').in('request_id', reqIds).in('status', ['pending', 'approved']).limit(1)
    hasOpenProductRequest = !!openItems?.length
  }

  return <ClosureView workOrder={workOrder} hasOpenProductRequest={hasOpenProductRequest} />
}
