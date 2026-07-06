'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import { getRoles, addRole, renameRole, deleteRole } from '@/app/actions/roles-actions'
import type { RoleWithCount } from '@/app/actions/roles-actions'

const fi: React.CSSProperties = { padding: '8px 11px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', flex: 1, transition: 'border .15s' }

export default function ManageRolesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [roles, setRoles] = useState<RoleWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingRole, setDeletingRole] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { roles: data } = await getRoles()
    setRoles(data)
    setLoading(false)
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setError('')
    const { error } = await addRole(newName)
    setAdding(false)
    if (error) { setError(error); return }
    setNewName('')
    load()
  }

  function startEdit(role: RoleWithCount) {
    setEditingRole(role.name)
    setEditName(role.name)
    setError('')
  }

  async function saveEdit() {
    if (!editingRole) return
    setSavingEdit(true)
    setError('')
    const { error } = await renameRole(editingRole, editName)
    setSavingEdit(false)
    if (error) { setError(error); return }
    setEditingRole(null)
    load()
  }

  async function handleDelete(name: string) {
    setDeletingRole(name)
    setError('')
    const { error } = await deleteRole(name)
    setDeletingRole(null)
    if (error) { setError(error); return }
    load()
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Roles" size="sm"
      footer={<button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Close</button>}>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>
      )}

      {/* Add new role */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          style={fi}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New role name…"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap', opacity: adding ? .7 : 1 }}
        >
          {adding ? 'Adding…' : '+ Add role'}
        </button>
      </form>

      {/* Roles list */}
      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--txm)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {roles.map(r => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--gl)', borderRadius: 8, border: '1px solid var(--gm)' }}>
              {editingRole === r.name ? (
                <>
                  <input
                    style={{ ...fi, flex: 1 }}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingRole(null) }}
                    autoFocus
                  />
                  <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif', opacity: savingEdit ? .7 : 1 }}>
                    {savingEdit ? '…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingRole(null)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1 }}>
                      {r.user_count} user{r.user_count !== 1 ? 's' : ''}
                      {r.is_system && <span style={{ marginLeft: 6, background: 'var(--mp)', color: 'var(--m)', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>System</span>}
                    </div>
                  </div>
                  {!r.is_system && (
                    <>
                      <button
                        onClick={() => startEdit(r)}
                        title="Rename"
                        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(r.name)}
                        disabled={deletingRole === r.name}
                        title={r.user_count > 0 ? 'Reassign users before deleting' : 'Delete role'}
                        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: r.user_count > 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: r.user_count > 0 || deletingRole === r.name ? .4 : 1 }}
                      >
                        {deletingRole === r.name
                          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                          : <svg width="12" height="12" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        }
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--txm)', lineHeight: 1.6 }}>
        System roles cannot be renamed or deleted. Custom roles with assigned users cannot be deleted until users are reassigned.
      </div>
    </Modal>
  )
}
