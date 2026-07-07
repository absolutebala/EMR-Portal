import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import NifpsAssessmentForm from '@/components/forms/NifpsAssessmentForm'

export default async function NewNifpsAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; transformerId?: string }>
}) {
  const { customerId, transformerId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()
  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  // Pre-populate from customer / transformer if passed
  const preload: Record<string, string> = {}
  if (customerId) {
    const { data: cust } = await supabase.from('customers').select('name,phone,contact_person').eq('id', customerId).single()
    if (cust) {
      preload.customer_name = cust.name
      preload.customer_phone = cust.phone
    }
  }
  if (transformerId) {
    const { data: tx } = await supabase.from('transformers').select('serial_number,year_of_manufacture,rating').eq('id', transformerId).single()
    if (tx) {
      preload.serial_number = tx.serial_number
      preload.year_of_mfg = tx.year_of_manufacture || ''
      preload.rating = tx.rating || ''
    }
  }
  if (profile) {
    preload.engineer_name = `${profile.first_name} ${profile.last_name}`
  }

  return (
    <>
      <Topbar title="New Assessment" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <NifpsAssessmentForm
          initialData={preload}
          customerId={customerId}
          transformerId={transformerId}
        />
      </div>
    </>
  )
}
