'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { saveSettings } from '@/app/actions/save-settings'
import { sendAppUpdatePrompt } from '@/app/actions/send-app-update'
import { addHoliday, deleteHoliday, type Holiday } from '@/app/actions/holidays'
import { addDepartment, updateDepartment, deleteDepartment, reorderDepartments } from '@/app/actions/departments'
import type { Department } from '@/lib/departments'

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

interface SettingsShape {
  org_name: string
  theme_color: string
  timezone: string
  date_format: string
  admin_email: string
  whatsapp_api_key: string
  whatsapp_campaign_assigned_engineer: string
  whatsapp_campaign_assigned_customer: string
  whatsapp_campaign_reassigned_customer: string
  whatsapp_campaign_on_the_way: string
  whatsapp_campaign_product_request: string
  whatsapp_campaign_escalation: string
  whatsapp_campaign_completed: string
  whatsapp_campaign_pending: string
  whatsapp_campaign_expense_reminder: string
  whatsapp_campaign_product_requested_customer: string
  whatsapp_campaign_dispatched_customer: string
  whatsapp_campaign_password_otp: string
  sms_gateway: string
  sms_api_key: string
  sms_sender_id: string
  sms_template_id: string
  sms_type: string
  sms_otp_template: string
  notification_channel: string
  sms_notification_type: string
  sms_notification_templates: Record<string, { id?: string; text?: string }>
  logo_url: string
  play_store_url: string
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
    key: 'whatsapp_campaign_assigned_customer', label: 'Assigned (first time) — Customer campaign',
    params: '1) Engineer name  2) Scheduled date  3) Engineer phone number',
    example: 'Hello Sir, our Service Engineer {{1}} will visit the site on {{2}}. You can reach the engineer directly at {{3}}.',
  },
  {
    key: 'whatsapp_campaign_reassigned_customer', label: 'Reassigned (engineer changed) — Customer campaign',
    params: '1) Engineer name  2) Visit date  3) Engineer phone number',
    example: 'Hi Sir, Please note that a different engineer has been assigned to your site visit. Our Service Engineer, {{1}}, will now attend your site on {{2}}. For coordination regarding the visit, please contact the engineer directly at {{3}}. Thank you for your understanding and cooperation.',
  },
  {
    key: 'whatsapp_campaign_on_the_way', label: 'Engineer "on the way" — Customer campaign',
    params: '1) Engineer name  2) Engineer phone number',
    example: 'Our Service Engineer, {{1}}, is on the way to your site. For coordination, please contact the engineer directly at {{2}}. Thank you.',
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
    key: 'whatsapp_campaign_product_requested_customer', label: 'Material requested — Customer campaign',
    params: 'No variables',
    example: 'Our Service Engineer has inspected your site and requested the product/material needed to carry out further rectification work. We are arranging the requested material and will keep you updated on its availability and the next steps. Thank you for your cooperation.',
  },
  {
    key: 'whatsapp_campaign_escalation', label: 'Needs reassignment — Admin campaign',
    params: '1) Notification number  2) Engineer name  3) Transformer serial no.  4) Reason',
    example: '⚠️ Notification *{{1}}* needs reassignment.\n\nEngineer: {{2}}\nTransformer S/N: {{3}}\nReason: {{4}}\n\nPlease review and reassign in the EMR Portal.',
  },
  {
    key: 'whatsapp_campaign_expense_reminder', label: 'Pending expense reminder — Admin campaign',
    params: '1) Engineer name  2) Pending expense count',
    example: 'Hi, {{1}} has {{2}} expense(s) awaiting your approval.\n\nPlease review in the EMR Portal.',
  },
  {
    key: 'whatsapp_campaign_dispatched_customer', label: 'Material dispatched — Customer campaign',
    params: '1) Customer name  2) Notification number  3) Docket number (or "-")',
    example: 'Hello {{1}}, the material for your notification {{2}} has been dispatched. Docket no: {{3}}.',
  },
]

interface Props {
  initialSettings: SettingsShape
  settingsId: string | null
  initialHolidays: Holiday[]
  initialDepartments: Department[]
  userName: string
  userRole: string
}

export default function SettingsPageClient({ initialSettings, settingsId, initialHolidays, initialDepartments, userName, userRole }: Props) {
  const router = useRouter()
  const [settings, setSettings] = useState<SettingsShape>(initialSettings)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const [updateMessage, setUpdateMessage] = useState('A new version of the app is available. Please update from the Play Store for the latest features and fixes.')
  const [sendingUpdate, setSendingUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSendUpdatePrompt() {
    setSendingUpdate(true)
    setUpdateResult(null)
    const { error, sent } = await sendAppUpdatePrompt(updateMessage)
    setSendingUpdate(false)
    setUpdateResult(error ? { ok: false, text: error } : { ok: true, text: `Update prompt sent to ${sent ?? 0} engineer${sent === 1 ? '' : 's'}.` })
  }

  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')
  const [addingHoliday, setAddingHoliday] = useState(false)
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null)
  const [holidayError, setHolidayError] = useState('')

  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [addingDepartment, setAddingDepartment] = useState(false)
  const [departmentError, setDepartmentError] = useState('')
  const [editDeptId, setEditDeptId] = useState<string | null>(null)
  const [editDeptName, setEditDeptName] = useState('')
  const [deptBusy, setDeptBusy] = useState(false)
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<Department | null>(null)

  async function handleAddHoliday() {
    setHolidayError('')
    if (!newHolidayDate || !newHolidayName.trim()) { setHolidayError('Date and name are required'); return }
    setAddingHoliday(true)
    const { error } = await addHoliday(newHolidayDate, newHolidayName)
    setAddingHoliday(false)
    if (error) { setHolidayError(error); return }
    setNewHolidayDate('')
    setNewHolidayName('')
    router.refresh()
  }

  async function handleDeleteHoliday(id: string) {
    setDeletingHolidayId(id)
    await deleteHoliday(id)
    setDeletingHolidayId(null)
    router.refresh()
  }

  async function handleAddDepartment() {
    setDepartmentError('')
    if (!newDepartmentName.trim()) { setDepartmentError('Department name is required'); return }
    setAddingDepartment(true)
    const { error } = await addDepartment(newDepartmentName)
    setAddingDepartment(false)
    if (error) { setDepartmentError(error); return }
    setNewDepartmentName('')
    router.refresh()
  }

  async function handleRenameDepartment() {
    if (!editDeptId) return
    setDepartmentError('')
    if (!editDeptName.trim()) { setDepartmentError('Department name is required'); return }
    setDeptBusy(true)
    const { error } = await updateDepartment(editDeptId, editDeptName)
    setDeptBusy(false)
    if (error) { setDepartmentError(error); return }
    setEditDeptId(null); setEditDeptName('')
    router.refresh()
  }

  async function handleDeleteDepartment() {
    if (!confirmDeleteDept) return
    setDepartmentError('')
    setDeptBusy(true)
    const { error } = await deleteDepartment(confirmDeleteDept.id)
    setDeptBusy(false)
    if (error) { setDepartmentError(error); setConfirmDeleteDept(null); return }
    setConfirmDeleteDept(null)
    router.refresh()
  }

  async function moveDepartment(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= initialDepartments.length) return
    const ids = initialDepartments.map(d => d.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setDeptBusy(true)
    await reorderDepartments(ids)
    setDeptBusy(false)
    router.refresh()
  }

  function set(k: string, v: string) { setSettings(s => ({ ...s, [k]: v })) }
  // Update one field (id | text) of one event's SMS notification template (JSON column).
  function setSmsTemplate(event: string, field: 'id' | 'text', v: string) {
    setSettings(s => ({
      ...s,
      sms_notification_templates: {
        ...s.sms_notification_templates,
        [event]: { ...(s.sms_notification_templates[event] || {}), [field]: v },
      },
    }))
  }

  const saveBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }
  // Reusable "Save this section" row; each card saves only its own fields.
  function SaveRow({ section, label, fields }: { section: string; label?: string; fields: () => Record<string, unknown> }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button onClick={() => save(section, fields())} disabled={saving === section} style={{ ...saveBtnStyle, opacity: saving === section ? 0.7 : 1 }}>
          {saving === section ? 'Saving…' : (label || 'Save')}
        </button>
        {saved === section && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
      </div>
    )
  }

  async function save(section: string, fields: Record<string, unknown>) {
    if (!settingsId) return
    setSaving(section)
    const { error } = await saveSettings(settingsId, fields)
    setSaving(null)
    if (error) { alert(`Save failed: ${error}`); return }
    setSaved(section)
    setTimeout(() => setSaved(null), 2000)
  }

  const ss: React.CSSProperties = { background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 20, marginBottom: 14 }
  const h3s: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--tx)', margin: 0, marginBottom: 3 }
  const ps: React.CSSProperties = { fontSize: 11, color: 'var(--txm)', marginBottom: 14, marginTop: 0 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }

  return (
    <>
      <Topbar title="Settings" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px', maxWidth: 800 }}>

        {/* Messaging accounts (Combirds) */}
        <div style={ss}>
          <h3 style={h3s}>Messaging accounts (Combirds)</h3>
          <p style={ps}>The Combirds credentials shared by all notifications and the password-reset OTP.</p>
          <div style={grid2}>
            <div><label style={fl2}>WhatsApp API key</label><input style={fi2} value={settings.whatsapp_api_key} onChange={e => set('whatsapp_api_key', e.target.value)} placeholder="Combirds WhatsApp API key" /></div>
            <div><label style={fl2}>SMS API key (x-api-key)</label><input style={fi2} value={settings.sms_api_key} onChange={e => set('sms_api_key', e.target.value)} placeholder="Combirds SMS API key" /></div>
            <div><label style={fl2}>SMS Sender ID</label><input style={fi2} value={settings.sms_sender_id} onChange={e => set('sms_sender_id', e.target.value)} placeholder="DLT sender header, e.g. EMRGLB" /></div>
          </div>
          <SaveRow section="accounts" fields={() => ({ whatsapp_api_key: settings.whatsapp_api_key || null, sms_api_key: settings.sms_api_key || null, sms_sender_id: settings.sms_sender_id || null })} />
        </div>

        {/* Notification channel */}
        <div style={ss}>
          <h3 style={h3s}>Notification channel</h3>
          <p style={ps}>How customer &amp; engineer notifications are delivered. On SMS, any event without a DLT template below falls back to WhatsApp.</p>
          <div style={{ maxWidth: 300 }}>
            <label style={fl2}>Send notifications via</label>
            <select style={fi2} value={settings.notification_channel} onChange={e => set('notification_channel', e.target.value)}>
              <option value="whatsapp">WhatsApp only</option>
              <option value="sms">SMS (fall back to WhatsApp)</option>
              <option value="both">Both WhatsApp &amp; SMS</option>
            </select>
          </div>
          <SaveRow section="channel" fields={() => ({ notification_channel: settings.notification_channel || 'whatsapp' })} />
        </div>

        {/* Notification messages — WhatsApp + SMS per event, together */}
        <div style={ss}>
          <h3 style={h3s}>Notification messages</h3>
          <p style={ps}>Set the WhatsApp campaign and/or the SMS template for each event in one place. Which one actually sends is decided by the Notification channel above (on SMS, an event with no SMS template falls back to WhatsApp). WhatsApp campaigns must be &quot;Live&quot; in Combirds; SMS text must match your DLT-approved template, with <code>{'{1}'}</code> <code>{'{2}'}</code> … in the listed param order. Leave a channel blank to skip it for that event.</p>
          <div style={{ maxWidth: 300, marginBottom: 6 }}>
            <label style={fl2}>SMS type (all notification SMS)</label>
            <input style={fi2} value={settings.sms_notification_type} onChange={e => set('sms_notification_type', e.target.value)} placeholder="Combirds billing-approved smsType" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <SaveRow section="sms_type" fields={() => ({ sms_notification_type: settings.sms_notification_type || null })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CAMPAIGN_FIELDS.map(f => {
              const ev = (f.key as string).replace('whatsapp_campaign_', '')
              const tpl = settings.sms_notification_templates[ev] || {}
              return (
                <div key={ev} style={{ border: '1px solid var(--gm)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 2 }}>{f.label}</div>
                  <p style={{ fontSize: 10, color: 'var(--txm)', margin: '0 0 10px' }}>Params: {f.params}</p>

                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 4 }}>WhatsApp</div>
                  <input style={fi2} value={settings[f.key] as string} onChange={e => set(f.key, e.target.value)} placeholder="Combirds campaign name" />
                  <pre style={{
                    fontSize: 10, lineHeight: 1.5, color: 'var(--tx)', background: 'var(--gl)',
                    border: '1px solid var(--gm)', borderRadius: 6, padding: '8px 10px', margin: '4px 0 0',
                    whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace',
                  }}>{f.example}</pre>

                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--m)', margin: '12px 0 4px' }}>SMS</div>
                  <input style={{ ...fi2, maxWidth: 320, marginBottom: 6 }} value={tpl.id || ''} onChange={e => setSmsTemplate(ev, 'id', e.target.value)} placeholder="DLT template ID" />
                  <textarea style={{ ...fi2, minHeight: 52, resize: 'vertical', fontFamily: 'inherit' }} value={tpl.text || ''} onChange={e => setSmsTemplate(ev, 'text', e.target.value)} placeholder="SMS text using {1} {2} … in the param order above" />

                  {/* Each event saves on its own — the WhatsApp campaign name + its SMS
                      template (the full sms_notification_templates object, which already
                      holds every event's current edit, so other events aren't clobbered). */}
                  <div style={{ marginTop: 10 }}>
                    <SaveRow section={`msg_${ev}`} fields={() => ({ [f.key]: settings[f.key] || null, sms_notification_templates: settings.sms_notification_templates || {} })} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Password reset OTP */}
        <div style={ss}>
          <h3 style={h3s}>Password reset OTP</h3>
          <p style={ps}>Powers the mobile &quot;Forgot password?&quot; flow. SMS is used when all its fields are filled; otherwise the WhatsApp OTP campaign is used. Reuses the SMS API key &amp; Sender ID above.</p>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }}>SMS</div>
          <div style={grid2}>
            <div><label style={fl2}>DLT template ID</label><input style={fi2} value={settings.sms_template_id} onChange={e => set('sms_template_id', e.target.value)} placeholder="e.g. 1707161719949940074" /></div>
            <div><label style={fl2}>SMS type</label><input style={fi2} value={settings.sms_type} onChange={e => set('sms_type', e.target.value)} placeholder="Combirds billing-approved smsType" /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={fl2}>OTP message template</label>
            <textarea style={{ ...fi2, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} value={settings.sms_otp_template} onChange={e => set('sms_otp_template', e.target.value)} placeholder="Your EMR Field Service password reset OTP is {otp}. Valid 10 minutes. Do not share it with anyone." />
            <p style={{ fontSize: 10, color: 'var(--txm)', margin: '4px 0 0' }}>Must match your DLT-approved template exactly, with <code>{'{otp}'}</code> where the code goes.</p>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', margin: '16px 0 8px' }}>WhatsApp</div>
          <div>
            <label style={fl2}>WhatsApp OTP campaign</label>
            <input style={fi2} value={settings.whatsapp_campaign_password_otp} onChange={e => set('whatsapp_campaign_password_otp', e.target.value)} placeholder="Combirds WhatsApp campaign name (1 param = the code)" />
            <p style={{ fontSize: 10, color: 'var(--txm)', margin: '4px 0 0' }}>Live campaign with a single template param for the 6-digit code.</p>
          </div>
          <SaveRow section="otp" label="Save OTP settings" fields={() => ({ sms_template_id: settings.sms_template_id || null, sms_type: settings.sms_type || null, sms_otp_template: settings.sms_otp_template || null, whatsapp_campaign_password_otp: settings.whatsapp_campaign_password_otp || null })} />
        </div>

        {/* App update prompt (mobile) */}
        <div style={ss}>
          <h3 style={h3s}>Mobile app update</h3>
          <p style={ps}>Set the Google Play link the app&apos;s &quot;Update now&quot; button opens, then push an update prompt to every field engineer&apos;s phone — they get a notification plus an in-app popup with your message.</p>

          <div style={{ marginBottom: 14 }}>
            <label style={fl2}>Google Play Store link</label>
            <input style={fi2} value={settings.play_store_url} onChange={e => set('play_store_url', e.target.value)} placeholder="https://play.google.com/store/apps/details?id=..." />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button onClick={() => save('play_store', { play_store_url: settings.play_store_url || null })} disabled={saving === 'play_store'}
                style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving === 'play_store' ? .7 : 1 }}>
                {saving === 'play_store' ? 'Saving…' : 'Save link'}
              </button>
              {saved === 'play_store' && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
            </div>
          </div>

          <div>
            <label style={fl2}>Update prompt message</label>
            <textarea value={updateMessage} onChange={e => setUpdateMessage(e.target.value)} rows={3}
              style={{ ...fi2, resize: 'vertical', fontFamily: 'Poppins,sans-serif' }} placeholder="Message shown in the popup and notification" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button onClick={handleSendUpdatePrompt} disabled={sendingUpdate || !updateMessage.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: sendingUpdate ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: (sendingUpdate || !updateMessage.trim()) ? .7 : 1 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                {sendingUpdate ? 'Sending…' : 'Send update prompt'}
              </button>
              {updateResult && <span style={{ fontSize: 11, color: updateResult.ok ? 'var(--green)' : '#DC2626' }}>{updateResult.ok ? '✓ ' : ''}{updateResult.text}</span>}
            </div>
            <p style={{ fontSize: 10, color: 'var(--txm)', margin: '8px 0 0' }}>Save the Play Store link first so the popup&apos;s &quot;Update now&quot; button points to the right place.</p>
          </div>
        </div>

        {/* Holidays */}
        <div style={ss}>
          <h3 style={h3s}>Holidays</h3>
          <p style={ps}>A day marked here shows the holiday name instead of &quot;Leave&quot; on the attendance calendar for every field engineer, even if no one marks attendance that day.</p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <label style={fl2}>Date</label>
              <input type="date" style={fi2} value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={fl2}>Name</label>
              <input style={fi2} value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} placeholder="e.g. Diwali" />
            </div>
            <button
              onClick={handleAddHoliday}
              disabled={addingHoliday}
              style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: addingHoliday ? .7 : 1, whiteSpace: 'nowrap' }}
            >
              {addingHoliday ? 'Adding…' : '+ Add holiday'}
            </button>
          </div>

          {holidayError && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 7, padding: '8px 10px', fontSize: 11, marginBottom: 12 }}>{holidayError}</div>}

          {initialHolidays.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--txm)' }}>No holidays added yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {initialHolidays.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--gl)', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: 'var(--tx)' }}>
                    <strong>{new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong> — {h.name}
                  </span>
                  <button
                    onClick={() => handleDeleteHoliday(h.id)}
                    disabled={deletingHolidayId === h.id}
                    style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}
                  >
                    {deletingHolidayId === h.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Departments */}
        <div style={ss}>
          <h3 style={h3s}>Departments</h3>
          <p style={ps}>Field Engineers belong to one department; Service Managers (and other roles) can be assigned to one or more. Requests from a Field Engineer — expenses, attendance amendments, product requests — route to whoever&apos;s assigned to their department.</p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={fl2}>Name</label>
              <input style={fi2} value={newDepartmentName} onChange={e => setNewDepartmentName(e.target.value)} placeholder="e.g. NIFPS 3" />
            </div>
            <button
              onClick={handleAddDepartment}
              disabled={addingDepartment}
              style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: addingDepartment ? .7 : 1, whiteSpace: 'nowrap' }}
            >
              {addingDepartment ? 'Adding…' : '+ Add department'}
            </button>
          </div>

          {departmentError && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 7, padding: '8px 10px', fontSize: 11, marginBottom: 12 }}>{departmentError}</div>}

          {initialDepartments.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--txm)' }}>No departments added yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {initialDepartments.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--gm)', borderRadius: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button onClick={() => moveDepartment(i, -1)} disabled={i === 0 || deptBusy} title="Move up"
                      style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', padding: 0, lineHeight: 0, opacity: i === 0 ? .3 : 1 }}>
                      <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15" /></svg>
                    </button>
                    <button onClick={() => moveDepartment(i, 1)} disabled={i === initialDepartments.length - 1 || deptBusy} title="Move down"
                      style={{ background: 'none', border: 'none', cursor: i === initialDepartments.length - 1 ? 'default' : 'pointer', padding: 0, lineHeight: 0, opacity: i === initialDepartments.length - 1 ? .3 : 1 }}>
                      <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                  {editDeptId === d.id ? (
                    <>
                      <input autoFocus value={editDeptName} onChange={e => setEditDeptName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameDepartment() }}
                        style={{ ...fi2, flex: 1 }} />
                      <button onClick={handleRenameDepartment} disabled={deptBusy}
                        style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'Poppins,sans-serif' }}>Save</button>
                      <button onClick={() => { setEditDeptId(null); setEditDeptName('') }} disabled={deptBusy}
                        style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--tx)' }}>{d.name}</span>
                      <button onClick={() => { setDepartmentError(''); setEditDeptId(d.id); setEditDeptName(d.name) }} title="Rename"
                        style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <svg width="11" height="11" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" /></svg>
                      </button>
                      <button onClick={() => { setDepartmentError(''); setConfirmDeleteDept(d) }} title="Delete"
                        style={{ background: '#FEF2F2', border: 'none', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <svg width="11" height="11" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {confirmDeleteDept && (
          <Modal open onClose={() => { if (!deptBusy) setConfirmDeleteDept(null) }} title="Delete department">
            <div style={{ fontSize: 13, color: 'var(--tx)', marginBottom: 8 }}>
              Delete <strong>{confirmDeleteDept.name}</strong>? Any notifications tagged with it become “No Department”, and any Service Manager assigned to it loses that assignment. This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button onClick={() => setConfirmDeleteDept(null)} disabled={deptBusy}
                style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
              <button onClick={handleDeleteDepartment} disabled={deptBusy}
                style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#DC2626', color: '#fff', cursor: deptBusy ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: deptBusy ? 0.7 : 1 }}>
                {deptBusy ? 'Deleting…' : 'Delete department'}
              </button>
            </div>
          </Modal>
        )}

      </div>
    </>
  )
}
