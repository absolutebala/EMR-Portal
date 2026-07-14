export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMobileWorkOrderWithForm } from '@/app/actions/mobile-actions'
import FormFillView from '@/components/mobile/FormFillView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MobileWorkOrderPage({ params }: Props) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/mobile/login')

  const { id } = await params
  const { workOrder, form, existingSubmission, error } = await getMobileWorkOrderWithForm(id)

  if (error || !workOrder) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Work order not found'}
      </div>
    )
  }

  return (
    <FormFillView
      workOrder={workOrder}
      form={form}
      existingSubmission={existingSubmission}
    />
  )
}
