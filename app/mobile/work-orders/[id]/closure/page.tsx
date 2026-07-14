export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMobileWorkOrderBasic } from '@/app/actions/mobile-actions'
import ClosureView from './ClosureView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileClosurePage({ params }: Props) {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

  const { id } = await params
  const { workOrder, error } = await getMobileWorkOrderBasic(id)

  if (error || !workOrder) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Work order not found'}
      </div>
    )
  }

  return <ClosureView workOrder={workOrder} />
}
