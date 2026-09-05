import { getAuthedUser } from '@/lib/cognito/server'
import SettingsPageClient from './SettingsPageClient'
import { getHolidays } from '@/app/actions/holidays'
import { getDepartments } from '@/app/actions/departments'
import { adminClient } from '@/lib/db/admin-client'

export default async function SettingsPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { data }, { holidays }, { departments }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    adminClient().from('settings').select('*').single(),
    getHolidays(),
    getDepartments(),
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
    whatsapp_campaign_assigned_engineer: data?.whatsapp_campaign_assigned_engineer || '',
    whatsapp_campaign_assigned_customer: data?.whatsapp_campaign_assigned_customer || '',
    whatsapp_campaign_on_the_way: data?.whatsapp_campaign_on_the_way || '',
    whatsapp_campaign_product_request: data?.whatsapp_campaign_product_request || '',
    whatsapp_campaign_escalation: data?.whatsapp_campaign_escalation || '',
    whatsapp_campaign_completed: data?.whatsapp_campaign_completed || '',
    whatsapp_campaign_pending: data?.whatsapp_campaign_pending || '',
    whatsapp_campaign_expense_reminder: data?.whatsapp_campaign_expense_reminder || '',
    sms_gateway: data?.sms_gateway || 'twilio',
    sms_api_key: data?.sms_api_key || '',
    sms_sender_id: data?.sms_sender_id || '',
    logo_url: data?.logo_url || '',
    play_store_url: data?.play_store_url || '',
  }

  return (
    <SettingsPageClient
      initialSettings={initialSettings}
      settingsId={data?.id || null}
      initialHolidays={holidays}
      initialDepartments={departments}
      userName={userName}
      userRole={userRole}
    />
  )
}
