import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAssessment } from '@/app/actions/nifps-assessment'
import Topbar from '@/components/layout/Topbar'
import NifpsAssessmentForm from '@/components/forms/NifpsAssessmentForm'

export default async function EditNifpsAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()
  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const { data, error } = await getAssessment(id)
  if (!data || error) notFound()

  const assessment = data as { id: string; status: string; form_data: Record<string, string>; customer_id: string | null; transformer_id: string | null }

  return (
    <>
      <Topbar title="NIFPS Assessment" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <NifpsAssessmentForm
          id={id}
          initialData={assessment.form_data}
          initialStatus={assessment.status as 'draft' | 'submitted'}
          customerId={assessment.customer_id}
          transformerId={assessment.transformer_id}
        />
      </div>
    </>
  )
}
