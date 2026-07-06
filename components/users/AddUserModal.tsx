'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { inviteUser } from '@/app/actions/invite-user'
import type { UserRole, Profile } from '@/lib/types'

const ROLES: UserRole[] = [
  'Super Admin', 'Service Manager', 'Service Engineer',
  'Sales Executive Engineer', 'Inventory Team', 'Dispatch Team', 'Reporting Team',
]

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editUser?: Profile | null
}

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

export default function AddUserModal({ open, onClose, onSaved, editUser }: Props) {
  const [form, setForm] = useState({
    first_name: editUser?.first_name || '',
    last_name: editUser?.last_name || '',
    employee_id: editUser?.employee_id || '',
    email: editUser?.email || '',
    phone: editUser?.phone || '',
    department: editUser?.department || '',
    role: (editUser?.role || '') as UserRole | '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.role) { setError('Please select a role'); return }
    setLoading(true)
    setError('')

    try {
      if (editUser) {
        const { error } = await supabase.from('profiles').update({
          first_name: form.first_name,
          last_name: form.last_name,
          employee_id: form.employee_id,
          phone: form.phone || null,
          department: form.department || null,
          role: form.role as UserRole,
        }).eq('id', editUser.id)
        if (error) throw error
      } else {
        const { error: inviteError } = await inviteUser({
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          employee_id: form.employee_id,
          phone: form.phone || null,
          department: form.department || null,
          role: form.role,
        })
        if (inviteError) throw new Error(inviteError)
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!editUser

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit user' : 'Add user'}
      footer={
        <>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button form="user-form" type="submit" disabled={loading} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}
      <form id="user-form" onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={fl2}>First name <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name"
             />
          </div>
          <div>
            <label style={fl2}>Last name <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name"
             />
          </div>
          <div>
            <label style={fl2}>Employee ID <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.employee_id} onChange={e => set('employee_id', e.target.value)} placeholder="EMP-XXXXX"
             />
          </div>
          <div>
            <label style={fl2}>Email <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required type="email" disabled={isEdit} style={{ ...fi2, background: isEdit ? 'var(--gl)' : '#fff' }} value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@emrglobal.com"
             />
          </div>
          <div>
            <label style={fl2}>Phone</label>
            <input style={fi2} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 XXXXXXXXXX"
             />
          </div>
          <div>
            <label style={fl2}>Department</label>
            <input style={fi2} value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Field Services"
             />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Role <span style={{ color: 'var(--m)' }}>*</span></label>
            <select required style={{ ...fi2 }} value={form.role} onChange={e => set('role', e.target.value)}
             >
              <option value="">Select role</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
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
          <div style={{ background: 'var(--mp)', border: '1px solid var(--mb)', borderRadius: 8, padding: '10px 12px', marginTop: 14, fontSize: 11, color: 'var(--m)' }}>
            Login credentials will be auto-generated and emailed to the user on account creation.
          </div>
        )}
      </form>
    </Modal>
  )
}
