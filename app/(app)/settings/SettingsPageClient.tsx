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
  whatsapp_campaign_on_the_way: string
  whatsapp_campaign_product_request: string
  whatsapp_campaign_escalation: string
  whatsapp_campaign_completed: string
  whatsapp_campaign_pending: string
  whatsapp_campaign_expense_reminder: string
  sms_gateway: string
  sms_api_key: string
  sms_sender_id: string
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
  {
    key: 'whatsapp_campaign_expense_reminder', label: 'Pending expense reminder — Admin campaign',
    params: '1) Engineer name  2) Pending expense count',
    example: 'Hi, {{1}} has {{2}} expense(s) awaiting your approval.\n\nPlease review in the EMR Portal.',
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

  async function save(section: string, fields: Record<string, string | null>) {
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
