'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import { saveSettings, uploadLogo } from '@/app/actions/save-settings'

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

const THEMES = [
  { name: 'Maroon', color: '#7D1D3F', mdk: '#3A0A1C', ml: '#A8294F' },
  { name: 'Navy', color: '#1E3A5F', mdk: '#0D2238', ml: '#2A4F7C' },
  { name: 'Forest', color: '#064E3B', mdk: '#022C23', ml: '#065F46' },
  { name: 'Graphite', color: '#374151', mdk: '#111827', ml: '#4B5563' },
]

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [settings, setSettings] = useState({
    org_name: 'EMR Global',
    theme_color: '#7D1D3F',
    timezone: 'Asia/Kolkata',
    date_format: 'DD MMM YYYY',
    admin_email: 'admin@emrglobal.com',
    whatsapp_api_key: '',
    sms_gateway: 'twilio',
    sms_api_key: '',
    sms_sender_id: '',
    logo_url: '',
  })
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('settings').select('*').single()
    if (data) {
      setSettingsId(data.id)
      setSettings({
        org_name: data.org_name || 'EMR Global',
        theme_color: data.theme_color || '#7D1D3F',
        timezone: data.timezone || 'Asia/Kolkata',
        date_format: data.date_format || 'DD MMM YYYY',
        admin_email: data.admin_email || '',
        whatsapp_api_key: data.whatsapp_api_key || '',
        sms_gateway: data.sms_gateway || 'twilio',
        sms_api_key: data.sms_api_key || '',
        sms_sender_id: data.sms_sender_id || '',
        logo_url: data.logo_url || '',
      })
      if (data.logo_url) setLogoPreview(data.logo_url)
    }
  }, [supabase])

  useEffect(() => {
    loadSettings()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').select('first_name,last_name,role').eq('id', user.id).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
  }, [loadSettings, supabase])

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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !settingsId) return

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64Data = ev.target?.result as string
      setLogoPreview(base64Data)

      const ext = file.name.split('.').pop() || 'png'
      setSaving('branding')
      const { error, url } = await uploadLogo(settingsId, base64Data, file.type, ext)
      setSaving(null)
      if (error) { alert(`Logo upload failed: ${error}`); return }
      if (url) {
        setLogoPreview(url)
        setSettings(s => ({ ...s, logo_url: url }))
        setSaved('branding')
        setTimeout(() => setSaved(null), 2000)
      }
    }
    reader.readAsDataURL(file)
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
      <Topbar title="Settings" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px', maxWidth: 800 }}>

        {/* Branding */}
        <div style={ss}>
          <h3 style={h3s}>Organisation branding</h3>
          <p style={ps}>Upload your company logo and customise the portal appearance.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Company logo</div>
              <label style={{ border: '2px dashed var(--mb)', borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', display: 'block', transition: 'all .15s', position: 'relative' }}
                onMouseEnter={e => { (e.currentTarget as HTMLLabelElement).style.borderColor='var(--m)'; (e.currentTarget as HTMLLabelElement).style.background='var(--mp)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.borderColor='var(--mb)'; (e.currentTarget as HTMLLabelElement).style.background='' }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload}/>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ maxHeight: 60, maxWidth: '100%', marginBottom: 8, display: 'block', margin: '0 auto 8px' }}/>
                ) : (
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--m)" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 7px', opacity: .5 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                )}
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--m)' }}>{saving === 'branding' ? 'Uploading…' : logoPreview ? 'Click to change' : 'Click to upload logo'}</div>
                <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>PNG, SVG or JPG · Max 2MB</div>
                {saved === 'branding' && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>✓ Saved</div>}
              </label>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Preview</div>
              <div style={{ background: 'var(--mdk)', borderRadius: 10, padding: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 8 }}/>
                ) : (
                  <div style={{ width: 32, height: 32, background: 'var(--m)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{settings.org_name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>Admin Portal</div>
                </div>
              </div>
            </div>
          </div>
        </div>

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
            <div><label style={fl2}>WhatsApp Business API key</label><input style={fi2} value={settings.whatsapp_api_key} onChange={e => set('whatsapp_api_key', e.target.value)} placeholder="API key from Meta Business"/></div>
            <div><label style={fl2}>SMS gateway</label><select style={fi2} value={settings.sms_gateway} onChange={e => set('sms_gateway', e.target.value)}><option value="twilio">Twilio</option><option value="msg91">MSG91</option><option value="textlocal">TextLocal</option></select></div>
            <div><label style={fl2}>SMS API key</label><input style={fi2} value={settings.sms_api_key} onChange={e => set('sms_api_key', e.target.value)} placeholder="SMS gateway API key"/></div>
            <div><label style={fl2}>Sender ID</label><input style={fi2} value={settings.sms_sender_id} onChange={e => set('sms_sender_id', e.target.value)} placeholder="e.g. EMRGLB"/></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={() => save('notifications', { whatsapp_api_key: settings.whatsapp_api_key || null, sms_gateway: settings.sms_gateway || null, sms_api_key: settings.sms_api_key || null, sms_sender_id: settings.sms_sender_id || null })} disabled={saving === 'notifications'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving === 'notifications' ? .7 : 1 }}>
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
            <div><label style={fl2}>Organisation name</label><input style={fi2} value={settings.org_name} onChange={e => set('org_name', e.target.value)}/></div>
            <div><label style={fl2}>Default timezone</label><select style={fi2} value={settings.timezone} onChange={e => set('timezone', e.target.value)}><option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option><option value="UTC">UTC</option></select></div>
            <div><label style={fl2}>Date format</label><select style={fi2} value={settings.date_format} onChange={e => set('date_format', e.target.value)}><option value="DD MMM YYYY">DD MMM YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option></select></div>
            <div><label style={fl2}>Admin email</label><input type="email" style={fi2} value={settings.admin_email} onChange={e => set('admin_email', e.target.value)}/></div>
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
