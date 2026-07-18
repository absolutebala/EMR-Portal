export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMobileWorkOrderDetail } from '@/app/actions/mobile-actions'
import JobDetailClient from './JobDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileWorkOrderDetailPage({ params }: Props) {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

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
