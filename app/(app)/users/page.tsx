'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import AddUserModal from '@/components/users/AddUserModal'
import RolesModal from '@/components/users/RolesModal'
import { RoleBadge, StatusBadge } from '@/components/ui/Badge'
import { resendInvite } from '@/app/actions/resend-invite'
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
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showRoles, setShowRoles] = useState(false)
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteCopied, setInviteCopied] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState<string | null>(null)
  const supabase = createClient()

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadUsers()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('first_name,last_name,role').eq('id', user.id).single().then(({ data }) => {
          if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
        })
      }
    })
  }, [loadUsers, supabase])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.employee_id.toLowerCase().includes(q)
    const matchRole = !roleFilter || u.role === roleFilter
    const matchStatus = !statusFilter ||
      (statusFilter === 'Active' ? (u.is_active && !u.invite_pending) :
       statusFilter === 'Inactive' ? !u.is_active :
       statusFilter === 'Pending' ? u.invite_pending : true)
    return matchSearch && matchRole && matchStatus
  })

  async function deactivate(user: Profile) {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    loadUsers()
  }

  async function copyInviteLink(user: Profile) {
    setInviteLoading(user.id)
    const { inviteLink, error } = await resendInvite(user.email)
    setInviteLoading(null)
    if (error || !inviteLink) { alert(error || 'Failed to generate link'); return }
    await navigator.clipboard.writeText(inviteLink)
    setInviteCopied(user.id)
    setTimeout(() => setInviteCopied(null), 2500)
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
            <button onClick={() => setShowRoles(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Roles &amp; Permissions
            </button>
            <button onClick={() => { setEditUser(null); setShowAdd(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add User
            </button>
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
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={u.is_active} pending={u.invite_pending}/></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {u.invite_pending ? (
                          <button
                            onClick={() => copyInviteLink(u)}
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
                        ) : (
                          <>
                            <button onClick={() => { setEditUser(u); setShowAdd(true) }} title="Edit" style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
                            </button>
                            <button onClick={() => deactivate(u)} title={u.is_active ? 'Deactivate' : 'Activate'} style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: u.is_active ? 'var(--amber)' : 'var(--green)' }}>
                              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
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

        <AddUserModal open={showAdd} onClose={() => { setShowAdd(false); setEditUser(null) }} onSaved={loadUsers} editUser={editUser}/>
        <RolesModal open={showRoles} onClose={() => setShowRoles(false)}/>
      </div>
    </>
  )
}
