'use client'

import { useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { saveSettings } from '@/app/actions/save-settings'

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

const THEMES = [
  { name: 'Maroon', color: '#7D1D3F', mdk: '#3A0A1C', ml: '#A8294F' },
  { name: 'Navy', color: '#1E3A5F', mdk: '#0D2238', ml: '#2A4F7C' },
  { name: 'Forest', color: '#064E3B', mdk: '#022C23', ml: '#065F46' },
  { name: 'Graphite', color: '#374151', mdk: '#111827', ml: '#4B5563' },
]

interface SettingsShape {
  org_name: string
  theme_color: string
  timezone: string
  date_format: string
  admin_email: string
  whatsapp_api_key: string
  whatsapp_campaign_assigned_engineer: string
  whatsapp_campaign_assigned_customer: string
  whatsapp_campaign_on_the_way: string
  whatsapp_campaign_product_request: string
  whatsapp_campaign_escalation: string
  whatsapp_campaign_completed: string
  whatsapp_campaign_pending: string
  sms_gateway: string
  sms_api_key: string
  sms_sender_id: string
  logo_url: string
}

// Each Combirds WhatsApp campaign must already exist and be "Live" in the org's own
// Combirds dashboard, built to accept these exact params in this exact order — see the
// matching doc comment in lib/messaging/whatsapp.ts (the actual source of truth this
// mirrors). `example` is the literal template text to paste into Combirds when building
// each campaign — the {{n}} placeholders map 1:1 to the param order in `params`.
const CAMPAIGN_FIELDS: { key: keyof SettingsShape; label: string; params: string; example: string }[] = [
  {
    key: 'whatsapp_campaign_assigned_engineer', label: 'Assigned / reassigned — Engineer campaign',
    params: '1) Engineer name  2) Notification number  3) Customer name  4) Transformer serial no.  5) Scheduled date',
    example: 'Hi {{1}}, a new notification *{{2}}* has been assigned to you.\n\nCustomer: {{3}}\nTransformer S/N: {{4}}\nScheduled: {{5}}\n\nOpen the EMR Portal app for full details.',
  },
  {
    key: 'whatsapp_campaign_assigned_customer', label: 'Assigned / reassigned — Customer campaign',
    params: '1) Customer name  2) Notification number  3) Engineer name  4) Transformer serial no.  5) Scheduled date',
    example: 'Hi {{1}}, your notification *{{2}}* has been assigned to {{3}}.\n\nTransformer S/N: {{4}}\nScheduled: {{5}}\n\nWe’ll keep you updated.',
  },
  {
    key: 'whatsapp_campaign_on_the_way', label: 'Engineer "on the way" — Customer campaign',
    params: '1) Customer name  2) Engineer name  3) Notification number  4) Start-by time',
    example: 'Hi {{1}}, {{2}} is on the way for your notification *{{3}}*.\n\nExpected by: {{4}}\n\nWe’ll keep you posted.',
  },
  {
    key: 'whatsapp_campaign_completed', label: 'Notification completed — Customer campaign',
    params: '1) Customer name  2) Notification number  3) Engineer name  4) Completion date',
    example: 'Hi {{1}}, your notification *{{2}}* has been completed by {{3}} on {{4}}.\n\nThank you for choosing EMR Global.',
  },
  {
    key: 'whatsapp_campaign_pending', label: 'Notification pending (follow-up) — Customer campaign',
    params: '1) Customer name  2) Notification number  3) Engineer name  4) Follow-up date',
    example: 'Hi {{1}}, your notification *{{2}}* is still in progress. {{3}} will follow up on {{4}}.\n\nWe’ll keep you updated.',
  },
  {
    key: 'whatsapp_campaign_product_request', label: 'Product request status — Engineer campaign',
    params: '1) Engineer name  2) Notification number  3) Status  4) Product name',
    example: 'Hi {{1}}, your product request for notification *{{2}}* has been {{3}}.\n\nItem: {{4}}\n\nCheck the EMR Portal app for details.',
  },
  {
    key: 'whatsapp_campaign_escalation', label: 'Needs reassignment — Admin campaign',
    params: '1) Notification number  2) Engineer name  3) Transformer serial no.  4) Reason',
    example: '⚠️ Notification *{{1}}* needs reassignment.\n\nEngineer: {{2}}\nTransformer S/N: {{3}}\nReason: {{4}}\n\nPlease review and reassign in the EMR Portal.',
  },
]

interface Props {
  initialSettings: SettingsShape
  settingsId: string | null
  userName: string
  userRole: string
}

export default function SettingsPageClient({ initialSettings, settingsId, userName, userRole }: Props) {
  const [settings, setSettings] = useState<SettingsShape>(initialSettings)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function set(k: string, v: string) { setSettings(s => ({ ...s, [k]: v })) }

  async function save(section: string, fields: Record<string, string | null>) {
    if (!settingsId) return
    setSaving(section)
    const { error } = await saveSettings(settingsId, fields)
    setSaving(null)
    if (error) { alert(`Save failed: ${error}`); return }
    setSaved(section)
    setTimeout(() => setSaved(null), 2000)
  }

  function applyTheme(t: typeof THEMES[0]) {
    document.documentElement.style.setProperty('--m', t.color)
    document.documentElement.style.setProperty('--mdk', t.mdk)
    document.documentElement.style.setProperty('--ml', t.ml)
    set('theme_color', t.color)
    save('theme', { theme_color: t.color })
  }

  const ss: React.CSSProperties = { background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 20, marginBottom: 14 }
  const h3s: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--tx)', margin: 0, marginBottom: 3 }
  const ps: React.CSSProperties = { fontSize: 11, color: 'var(--txm)', marginBottom: 14, marginTop: 0 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }

  return (
    <>
      <Topbar title="Settings" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px', maxWidth: 800 }}>

        {/* Colour theme */}
        <div style={ss}>
          <h3 style={h3s}>Colour theme</h3>
          <p style={ps}>Portal primary colour. Currently: {THEMES.find(t => t.color === settings.theme_color)?.name || 'Maroon'}.</p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {THEMES.map(t => (
              <div key={t.name} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => applyTheme(t)}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: t.color, cursor: 'pointer',
                  border: settings.theme_color === t.color ? `3px solid ${t.ml}` : '3px solid transparent',
                  boxShadow: settings.theme_color === t.color ? `0 0 0 2px ${t.color}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 14, transition: 'all .15s',
                }}>
                  {settings.theme_color === t.color && '✓'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--txm)', marginTop: 3 }}>{t.name}</div>
              </div>
            ))}
            {saving === 'theme' && <span style={{ fontSize: 11, color: 'var(--txm)' }}>Saving…</span>}
            {saved === 'theme' && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
          </div>
        </div>

        {/* Notifications */}
        <div style={ss}>
          <h3 style={h3s}>Notifications</h3>
          <p style={ps}>Configure channels for customer and engineer notifications.</p>
          <div style={grid2}>
            <div><label style={fl2}>Combirds API key</label><input style={fi2} value={settings.whatsapp_api_key} onChange={e => set('whatsapp_api_key', e.target.value)} placeholder="API key from your Combirds dashboard" /></div>
            <div><label style={fl2}>SMS gateway</label><select style={fi2} value={settings.sms_gateway} onChange={e => set('sms_gateway', e.target.value)}><option value="twilio">Twilio</option><option value="msg91">MSG91</option><option value="textlocal">TextLocal</option></select></div>
            <div><label style={fl2}>SMS API key</label><input style={fi2} value={settings.sms_api_key} onChange={e => set('sms_api_key', e.target.value)} placeholder="SMS gateway API key (not yet active)" /></div>
            <div><label style={fl2}>Sender ID</label><input style={fi2} value={settings.sms_sender_id} onChange={e => set('sms_sender_id', e.target.value)} placeholder="e.g. EMRGLB" /></div>
          </div>

          <div style={{ marginTop: 18, marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 2 }}>WhatsApp campaign mapping</div>
            <p style={ps}>Each campaign must already exist and be set to &quot;Live&quot; in your Combirds dashboard, built to accept the listed params in that exact order. Leave blank to skip that notification.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CAMPAIGN_FIELDS.map(f => (
              <div key={f.key}>
                <label style={fl2}>{f.label}</label>
                <input style={fi2} value={settings[f.key]} onChange={e => set(f.key, e.target.value)} placeholder="Combirds campaign name" />
                <p style={{ fontSize: 10, color: 'var(--txm)', margin: '4px 0 0' }}>Params: {f.params}</p>
                <pre style={{
                  fontSize: 10, lineHeight: 1.5, color: 'var(--tx)', background: 'var(--gl)',
                  border: '1px solid var(--gm)', borderRadius: 6, padding: '8px 10px', margin: '4px 0 0',
                  whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace',
                }}>{f.example}</pre>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={() => save('notifications', {
              whatsapp_api_key: settings.whatsapp_api_key || null,
              whatsapp_campaign_assigned_engineer: settings.whatsapp_campaign_assigned_engineer || null,
              whatsapp_campaign_assigned_customer: settings.whatsapp_campaign_assigned_customer || null,
              whatsapp_campaign_on_the_way: settings.whatsapp_campaign_on_the_way || null,
              whatsapp_campaign_product_request: settings.whatsapp_campaign_product_request || null,
              whatsapp_campaign_escalation: settings.whatsapp_campaign_escalation || null,
              whatsapp_campaign_completed: settings.whatsapp_campaign_completed || null,
              whatsapp_campaign_pending: settings.whatsapp_campaign_pending || null,
              sms_gateway: settings.sms_gateway || null, sms_api_key: settings.sms_api_key || null, sms_sender_id: settings.sms_sender_id || null,
            })} disabled={saving === 'notifications'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving === 'notifications' ? .7 : 1 }}>
              {saving === 'notifications' ? 'Saving…' : 'Save notification settings'}
            </button>
            {saved === 'notifications' && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
          </div>
        </div>

        {/* General */}
        <div style={ss}>
          <h3 style={h3s}>General settings</h3>
          <p style={ps}>Portal defaults and timezone configuration.</p>
          <div style={grid2}>
            <div><label style={fl2}>Organisation name</label><input style={fi2} value={settings.org_name} onChange={e => set('org_name', e.target.value)} /></div>
            <div><label style={fl2}>Default timezone</label><select style={fi2} value={settings.timezone} onChange={e => set('timezone', e.target.value)}><option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option><option value="UTC">UTC</option></select></div>
            <div><label style={fl2}>Date format</label><select style={fi2} value={settings.date_format} onChange={e => set('date_format', e.target.value)}><option value="DD MMM YYYY">DD MMM YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option></select></div>
            <div><label style={fl2}>Admin email</label><input type="email" style={fi2} value={settings.admin_email} onChange={e => set('admin_email', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={() => save('general', { org_name: settings.org_name, timezone: settings.timezone, date_format: settings.date_format, admin_email: settings.admin_email })} disabled={saving === 'general'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving === 'general' ? .7 : 1 }}>
              {saving === 'general' ? 'Saving…' : 'Save settings'}
            </button>
            {saved === 'general' && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
          </div>
        </div>
      </div>
    </>
  )
}
