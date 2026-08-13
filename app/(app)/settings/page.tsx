import { createClient, getAuthedUser } from '@/lib/supabase/server'
import SettingsPageClient from './SettingsPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { data }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    adminClient().from('settings').select('*').single(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const initialSettings = {
    org_name: data?.org_name || 'EMR Global',
    theme_color: data?.theme_color || '#7D1D3F',
    timezone: data?.timezone || 'Asia/Kolkata',
    date_format: data?.date_format || 'DD MMM YYYY',
    admin_email: data?.admin_email || '',
    whatsapp_api_key: data?.whatsapp_api_key || '',
    sms_gateway: data?.sms_gateway || 'twilio',
    sms_api_key: data?.sms_api_key || '',
    sms_sender_id: data?.sms_sender_id || '',
    logo_url: data?.logo_url || '',
  }

  return (
    <SettingsPageClient
      initialSettings={initialSettings}
      settingsId={data?.id || null}
      userName={userName}
      userRole={userRole}
    />
  )
}
