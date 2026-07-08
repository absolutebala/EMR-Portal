'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUsers } from '@/app/actions/get-users'
import { deleteUser } from '@/app/actions/delete-user'
import { getMyPermissions } from '@/app/actions/roles-actions'
import Topbar from '@/components/layout/Topbar'
import AddUserModal from '@/components/users/AddUserModal'
import BulkUploadModal from '@/components/users/BulkUploadModal'
import RolesModal from '@/components/users/RolesModal'
import ManageRolesModal from '@/components/users/ManageRolesModal'
import { RoleBadge, StatusBadge } from '@/components/ui/Badge'
import { resendInvite } from '@/app/actions/resend-invite'
import { resetUserPassword } from '@/app/actions/reset-user-password'
import type { Profile } from '@/lib/types'

const COLORS = ['#7D1D3F', '#5B6AC4', '#0891B2', '#D97706', '#059669', '#7C3AED', '#DC2626', '#1E3A5F']
function av(name: string, i: number) {
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string }>({ name: '', role: '' })
  const [myPermissions, setMyPermissions] = useState<Record<string, boolean> | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showRoles, setShowRoles] = useState(false)
  const [showManageRoles, setShowManageRoles] = useState(false)
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteCopied, setInviteCopied] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState<string | null>(null)
  const [resetCopied, setResetCopied] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { users: data } = await getUsers()
    setUsers(data as unknown as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadUsers()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('first_name,last_name,role').eq('id', user.id).single().then(({ data }) => {
          if (data) setCurrentUser(prev => ({ ...prev, name: `${data.first_name} ${data.last_name}`, role: data.role }))
        })
      }
    })
    getMyPermissions().then(({ permissions, role }) => {
      setMyPermissions(permissions)
      if (role) setCurrentUser(prev => ({ ...prev, role }))
    })
  }, [loadUsers, supabase])  // supabase stable via useMemo; loadUsers has no deps

  function can(key: string) {
    if (myPermissions === null) return false
    if (currentUser.role === 'Super Admin') return true
    const hasPerms = Object.keys(myPermissions).length > 0
    if (!hasPerms) return true
    return myPermissions[key] === true
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.employee_id.toLowerCase().includes(q)
    const matchRole = !roleFilter || u.role === roleFilter
    const isPending = u.invite_pending || !u.last_login_at
    const matchStatus = !statusFilter ||
      (statusFilter === 'Active' ? (u.is_active && !isPending) :
       statusFilter === 'Inactive' ? !u.is_active :
       statusFilter === 'Pending' ? isPending : true)
    return matchSearch && matchRole && matchStatus
  })

  async function handleDelete(userId: string) {
    setDeleting(userId)
    const { error } = await deleteUser(userId)
    setDeleting(null)
    setConfirmDelete(null)
    if (error) { alert(error); return }
    loadUsers()
  }

  async function copyInvitePassword(user: Profile) {
    setInviteLoading(user.id)
    const { tempPassword, error } = await resendInvite(user.email)
    setInviteLoading(null)
    if (error || !tempPassword) { alert(error || 'Failed to generate password'); return }
    const text = `EMR Portal Login Details\n\nURL: https://emr-portal-three.vercel.app\nEmail: ${user.email}\nTemporary Password: ${tempPassword}\n\nPlease log in and set your own password when prompted.`
    await navigator.clipboard.writeText(text)
    setInviteCopied(user.id)
    setTimeout(() => setInviteCopied(null), 2500)
  }

  async function copyResetPassword(user: Profile) {
    setResetLoading(user.id)
    const { tempPassword, error } = await resetUserPassword(user.email)
    setResetLoading(null)
    if (error || !tempPassword) { alert(error || 'Failed to reset password'); return }
    const text = `EMR Portal Login Details\n\nURL: https://emr-portal-three.vercel.app\nEmail: ${user.email}\nTemporary Password: ${tempPassword}\n\nPlease log in and set your own password when prompted.`
    await navigator.clipboard.writeText(text)
    setResetCopied(user.id)
    setTimeout(() => setResetCopied(null), 2500)
  }

  return (
    <>
      <Topbar title="Users" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '7px 12px' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--tx)', background: 'transparent', fontFamily: 'Poppins,sans-serif', width: 200 }}/>
            </div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '7px 12px', border: '1px solid var(--gm)', borderRadius: 8, fontSize: 12, color: 'var(--tx)', background: '#fff', outline: 'none', fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
              <option value="">All roles</option>
              {['Super Admin','Service Manager','Service Engineer','Sales Executive Engineer','Inventory Team','Dispatch Team','Reporting Team'].map(r => <option key={r}>{r}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 12px', border: '1px solid var(--gm)', borderRadius: 8, fontSize: 12, color: 'var(--tx)', background: '#fff', outline: 'none', fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
              <option value="">All status</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>Pending</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {can('Users — Roles View') && (
              <button onClick={() => setShowManageRoles(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M20 21a8 8 0 10-16 0"/><path d="M16 11l2 2 4-4"/></svg>
                Roles
              </button>
            )}
            {can('Users — Roles & Permissions View') && (
              <button onClick={() => setShowRoles(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Roles &amp; Permissions
              </button>
            )}
            {can('Users — Bulk Upload') && (
              <button onClick={() => setShowBulk(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Bulk Upload
              </button>
            )}
            {can('Users — Create / Edit') && (
              <button onClick={() => { setEditUser(null); setShowAdd(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add User
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading users…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No users found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['User', 'Employee ID', 'Role', 'Email', 'Phone', 'Last login', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--gm)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--mp)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {av(`${u.first_name} ${u.last_name}`, i)}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{u.first_name} {u.last_name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{u.employee_id}</td>
                    <td style={{ padding: '10px 14px' }}><RoleBadge role={u.role}/></td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{u.phone || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={u.is_active} pending={u.invite_pending || !u.last_login_at}/></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {(u.invite_pending || !u.last_login_at) ? (
                          <button
                            onClick={() => copyInvitePassword(u)}
                            disabled={inviteLoading === u.id}
                            title="Copy invite link"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--gm)', background: inviteCopied === u.id ? '#D1FAE5' : '#fff', color: inviteCopied === u.id ? '#065F46' : 'var(--txm)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}
                          >
                            {inviteLoading === u.id ? (
                              '…'
                            ) : inviteCopied === u.id ? (
                              <>✓ Copied</>
                            ) : (
                              <><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Copy invite</>
                            )}
                          </button>
                        ) : confirmDelete === u.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--txm)', whiteSpace: 'nowrap' }}>Delete?</span>
                            <button
                              onClick={() => handleDelete(u.id)}
                              disabled={deleting === u.id}
                              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: deleting === u.id ? .7 : 1 }}
                            >
                              {deleting === u.id ? '…' : 'Yes, delete'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            {can('Users — Create / Edit') && (
                              <button
                                onClick={() => copyResetPassword(u)}
                                disabled={resetLoading === u.id}
                                title="Copy password reset link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gm)', background: resetCopied === u.id ? '#D1FAE5' : 'var(--gl)', color: resetCopied === u.id ? '#065F46' : 'var(--txm)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}
                              >
                                {resetLoading === u.id ? '…' : resetCopied === u.id ? '✓ Copied' : (
                                  <><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Reset pwd</>
                                )}
                              </button>
                            )}
                            {can('Users — Create / Edit') && (
                              <button onClick={() => { setEditUser(u); setShowAdd(true) }} title="Edit" style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
                              </button>
                            )}
                            <button onClick={() => setConfirmDelete(u.id)} title="Delete user" style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <svg width="12" height="12" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <AddUserModal key={editUser?.id ?? 'new'} open={showAdd} onClose={() => { setShowAdd(false); setEditUser(null) }} onSaved={loadUsers} editUser={editUser} managers={users.filter(u => u.role === 'Service Manager')} currentUserRole={currentUser.role}/>
        <BulkUploadModal open={showBulk} onClose={() => setShowBulk(false)} onSaved={loadUsers}/>
        <ManageRolesModal open={showManageRoles} onClose={() => setShowManageRoles(false)} canEdit={can('Users — Roles Edit & Add')}/>
        <RolesModal open={showRoles} onClose={() => setShowRoles(false)} canEdit={can('Users — Roles & Permissions Edit')}/>
      </div>
    </>
  )
}
