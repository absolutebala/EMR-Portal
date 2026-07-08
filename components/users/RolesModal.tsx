'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import { getRolesWithPermissions, updateRolePermissions } from '@/app/actions/roles-actions'
import type { RoleWithPermissions } from '@/app/actions/roles-actions'

const ROLE_ORDER = [
  'Super Admin',
  'Service Manager',
  'Service Engineer',
  'Sales Executive Engineer',
  'Inventory Team',
  'Dispatch Team',
  'Reporting Team',
]

const MODULES = [
  'Dashboard',
  'Work Orders — View',
  'Work Orders — Create / Edit',
  'Work Orders — Delete',
  'Field Engineers — View',
  'Field Engineers — Manage',
  'Users — View',
  'Users — Create / Edit',
  'Users — Roles View',
  'Users — Roles Edit & Add',
  'Users — Roles & Permissions View',
  'Users — Roles & Permissions Edit',
  'Users — Bulk Upload',
  'Customers — View',
  'Customers — Create / Edit',
  'Products — View',
  'Forms — View',
  'Forms — Create / Edit',
  'Product Requests — View',
  'Product Requests — Approve',
  'Product Requests — Dispatch',
  'MoM — View / Download',
  'Settings',
]

export default function RolesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Record<string, Record<string, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { roles: data, error: err } = await getRolesWithPermissions()
    if (err) setError(err)
    const sorted = [...data].sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(a.name)
      const bi = ROLE_ORDER.indexOf(b.name)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    setRoles(sorted)
    setPending({})
    setLoading(false)
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  function getVal(role: RoleWithPermissions, mod: string): boolean {
    if (pending[role.name] && mod in pending[role.name]) return pending[role.name][mod]
    return role.permissions[mod] ?? false
  }

  function toggle(roleName: string, mod: string, cur: boolean) {
    setPending(p => ({ ...p, [roleName]: { ...(p[roleName] || {}), [mod]: !cur } }))
    setSaved(false)
    setError('')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    for (const [roleName, changes] of Object.entries(pending)) {
      const role = roles.find(r => r.name === roleName)
      if (!role) continue
      const { error } = await updateRolePermissions(roleName, { ...role.permissions, ...changes })
      if (error) { setError(error); setSaving(false); return }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  const hasPending = Object.keys(pending).length > 0

  return (
    <Modal open={open} onClose={onClose} title="Roles & Permissions" size="xl"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
          {error && <span style={{ fontSize: 11, color: '#DC2626', flex: 1 }}>{error}</span>}
          {saved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Close</button>
          <button
            onClick={handleSave}
            disabled={!hasPending || saving}
            style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', cursor: hasPending && !saving ? 'pointer' : 'not-allowed', opacity: !hasPending || saving ? .5 : 1 }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 12 }}>
        Click any cell to toggle access. Changes are applied when you click Save.
      </p>
      {error && !loading && (
        <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>{error}</div>
      )}
      {loading ? (
        <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: 'var(--txm)' }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', minWidth: 180 }}>
                  Permission / Module
                </th>
                {roles.map(r => (
                  <th key={r.name} style={{ padding: '9px 8px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap', minWidth: 90 }}>
                    {r.name.replace('Service ', 'Svc. ').replace('Executive Engineer', 'Exec.').replace(' Team', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, i) => (
                <tr key={mod} style={{ background: i % 2 === 0 ? 'var(--mp)' : '#fff', borderBottom: '1px solid var(--gm)' }}>
                  <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: mod.includes('—') ? 400 : 600, paddingLeft: mod.includes('—') ? 22 : 14, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                    {mod}
                  </td>
                  {roles.map(role => {
                    const val = getVal(role, mod)
                    const isDirty = pending[role.name] && mod in pending[role.name]
                    return (
                      <td key={role.name} style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggle(role.name, mod, val)}
                          title={`${val ? 'Revoke' : 'Grant'} ${mod} for ${role.name}`}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: isDirty ? '2px solid var(--m)' : '1px solid var(--gm)',
                            background: val ? (isDirty ? 'var(--mp)' : '#D1FAE5') : '#fff',
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .12s',
                          }}
                        >
                          {val
                            ? <svg width="13" height="13" fill="none" stroke={isDirty ? 'var(--m)' : '#065F46'} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg width="11" height="11" fill="none" stroke="var(--gm)" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          }
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
