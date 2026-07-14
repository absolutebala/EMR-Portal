export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMobileWorkOrderDetail } from '@/app/actions/mobile-actions'
import CheckInView from './CheckInView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileCheckInPage({ params }: Props) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/mobile/login')

  const { id } = await params
  const { detail, error } = await getMobileWorkOrderDetail(id)

  if (error || !detail) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Work order not found'}
      </div>
    )
  }

  return <CheckInView workOrder={detail.workOrder} />
}
