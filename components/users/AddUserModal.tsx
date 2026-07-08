'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import { inviteUser } from '@/app/actions/invite-user'
import { updateUser } from '@/app/actions/update-user'
import { getRoles, type RoleWithCount } from '@/app/actions/roles-actions'
import type { UserRole, Profile } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editUser?: Profile | null
  managers: Profile[]
  currentUserRole?: string
}

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

export default function AddUserModal({ open, onClose, onSaved, editUser, managers, currentUserRole }: Props) {
  const [form, setForm] = useState({
    first_name: editUser?.first_name || '',
    last_name: editUser?.last_name || '',
    employee_id: editUser?.employee_id || '',
    email: editUser?.email || '',
    phone: editUser?.phone || '',
    role: (editUser?.role || '') as UserRole | '',
    manager_id: editUser?.manager_id || '',
    is_active: editUser?.is_active ?? true,
  })
  const [roles, setRoles] = useState<RoleWithCount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadRoles = useCallback(async () => {
    const { roles: data } = await getRoles()
    setRoles(data)
  }, [])

  useEffect(() => { loadRoles() }, [loadRoles])

  useEffect(() => {
    setForm({
      first_name: editUser?.first_name || '',
      last_name: editUser?.last_name || '',
      employee_id: editUser?.employee_id || '',
      email: editUser?.email || '',
      phone: editUser?.phone || '',
      role: (editUser?.role || '') as UserRole | '',
      manager_id: editUser?.manager_id || '',
      is_active: editUser?.is_active ?? true,
    })
  }, [editUser])

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleClose() {
    setInviteLink(null)
    setCopied(false)
    setError('')
    onClose()
  }

  async function copyLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.role) { setError('Please select a role'); return }
    if (form.role === 'Service Engineer' && !form.manager_id) {
      setError('Please select a Reporting Manager for this Service Engineer')
      return
    }
    setLoading(true)
    setError('')

    try {
      if (editUser) {
        const { error } = await updateUser(editUser.id, {
          first_name: form.first_name,
          last_name: form.last_name,
          employee_id: form.employee_id,
          phone: form.phone || null,
          role: form.role as UserRole,
          manager_id: form.role === 'Service Engineer' ? (form.manager_id || null) : null,
          is_active: form.is_active,
        })
        if (error) throw new Error(error)
        onSaved()
        handleClose()
      } else {
        const { error: inviteError, inviteLink: link } = await inviteUser({
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          employee_id: form.employee_id,
          phone: form.phone || null,
          role: form.role,
          manager_id: form.role === 'Service Engineer' ? (form.manager_id || null) : null,
        })
        if (inviteError) throw new Error(inviteError)
        onSaved()
        if (link) setInviteLink(link)
        else handleClose()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!editUser
  const isSuperAdmin = currentUserRole === 'Super Admin'
  const assignableRoles = isSuperAdmin ? roles : roles.filter(r => r.name !== 'Super Admin')
  const selectedRole = roles.find(r => r.name === form.role)
  const isEngineer = selectedRole?.requires_manager ?? false

  // Success state — show invite link
  if (inviteLink) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="User created"
        footer={
          <button onClick={handleClose} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
            Done
          </button>
        }
      >
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="22" height="22" fill="none" stroke="#065F46" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Account created successfully</div>
          <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 20 }}>
            Share this one-time invite link with the user so they can set their password and log in.
          </div>
          <div style={{ background: 'var(--gl)', border: '1px solid var(--gm)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--txm)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {inviteLink}
            </span>
            <button
              onClick={copyLink}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--gm)', background: copied ? '#D1FAE5' : '#fff', color: copied ? '#065F46' : 'var(--tx)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--txm)' }}>
            This link expires in 24 hours.
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit user' : 'Add user'}
      footer={
        <>
          <button onClick={handleClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button form="user-form" type="submit" disabled={loading} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
            {loading ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}
      <form id="user-form" onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={fl2}>First name <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name" />
          </div>
          <div>
            <label style={fl2}>Last name <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name" />
          </div>
          <div>
            <label style={fl2}>Employee ID <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.employee_id} onChange={e => set('employee_id', e.target.value)} placeholder="EMP-XXXXX" />
          </div>
          <div>
            <label style={fl2}>Email <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required type="email" disabled={isEdit} style={{ ...fi2, background: isEdit ? 'var(--gl)' : '#fff' }} value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@emrglobal.com" />
          </div>
          <div>
            <label style={fl2}>Phone</label>
            <input style={fi2} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 XXXXXXXXXX" />
          </div>
          <div>
            <label style={fl2}>Role <span style={{ color: 'var(--m)' }}>*</span></label>
            <select required style={fi2} value={form.role} onChange={e => { set('role', e.target.value); set('manager_id', '') }}>
              <option value="">Select role</option>
              {assignableRoles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </div>

          {isEngineer && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fl2}>
                Reporting Manager <span style={{ color: 'var(--m)' }}>*</span>
              </label>
              {managers.length === 0 ? (
                <div style={{ padding: '9px 12px', border: '1.5px solid #FCA5A5', borderRadius: 7, fontSize: 12, color: '#DC2626', background: '#FEF2F2' }}>
                  No Service Managers found. Please add a Service Manager first.
                </div>
              ) : (
                <select
                  style={fi2}
                  value={form.manager_id}
                  onChange={e => set('manager_id', e.target.value)}
                  required
                >
                  <option value="">Select reporting manager</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.employee_id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {isEdit && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fl2}>Status</label>
              <div
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{
                  width: 38, height: 22, borderRadius: 11, position: 'relative', transition: 'background .2s',
                  background: form.is_active ? 'var(--m)' : '#9CA3AF',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: form.is_active ? 19 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: form.is_active ? 'var(--m)' : '#6B7280', fontWeight: 500 }}>
                  {form.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Module access <span style={{ color: 'var(--m)' }}>*</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', border: '1.5px solid var(--mb)', background: 'var(--mp)', borderRadius: 8, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ width: 15, height: 15, accentColor: 'var(--m)', cursor: 'pointer' }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--m)' }}>Field Management</div>
                  <div style={{ fontSize: 10, color: 'var(--txm)' }}>Work orders, engineers, forms, SAP</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', border: '1.5px solid var(--gm)', background: 'var(--gl)', borderRadius: 8, cursor: 'not-allowed', opacity: .55 }}>
                <input type="checkbox" disabled style={{ width: 15, height: 15, cursor: 'not-allowed' }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txm)' }}>Sales</div>
                  <div style={{ fontSize: 10, color: 'var(--txm)' }}>Leads, accounts, pipeline</div>
                </div>
                <span style={{ fontSize: 8, fontWeight: 600, background: 'var(--gm)', color: 'var(--txm)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>Coming soon</span>
              </label>
            </div>
          </div>
        </div>
        {!isEdit && (
          <div style={{ background: 'var(--mp)', border: '1px solid var(--mb)', borderRadius: 8, padding: '10px 12px', marginTop: 14, fontSize: 11, color: 'var(--m)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            An invite link will be generated for you to share with the user directly.
          </div>
        )}
      </form>
    </Modal>
  )
}
