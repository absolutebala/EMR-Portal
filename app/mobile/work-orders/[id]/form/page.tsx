export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileWorkOrderWithForm } from '@/app/actions/mobile-actions'
import FormFillView from '@/components/mobile/FormFillView'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}

export default async function MobileWorkOrderFormPage({ params, searchParams }: Props) {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { id } = await params
  const { view } = await searchParams
  const { workOrder, form, existingSubmission, readOnly, viewedEngineerName, error } = await getMobileWorkOrderWithForm(id, view)

  if (error || !workOrder) {
    return (
      <div style={{ padding: 24, color: '#DC2626', fontFamily: 'Poppins, sans-serif' }}>
        {error || 'Notification not found'}
      </div>
    )
  }

  return (
    <FormFillView
      workOrder={workOrder}
      form={form}
      existingSubmission={existingSubmission}
      readOnly={readOnly}
      viewedEngineerName={viewedEngineerName}
    />
  )
}
