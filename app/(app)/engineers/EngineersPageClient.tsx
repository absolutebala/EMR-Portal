'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import AddUserModal from '@/components/users/AddUserModal'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import { deleteUser } from '@/app/actions/delete-user'
import type { FieldEngineerOverview, EngineerStatus } from '@/app/actions/get-engineers'
import type { Profile } from '@/lib/types'

const STATUS_CONFIG: Record<EngineerStatus, { label: string; bg: string; color: string }> = {
  available: { label: 'Available', bg: '#D1FAE5', color: '#065F46' },
  unavailable: { label: 'Unavailable', bg: '#F3F4F6', color: '#6B7280' },
  on_leave: { label: 'On Leave', bg: '#F1F5F9', color: '#475569' },
  on_the_way: { label: 'On the way', bg: '#DBEAFE', color: '#1D4ED8' },
  travelling: { label: 'Travelling', bg: '#EDE9FE', color: '#5B21B6' },
  reached: { label: 'Reached project', bg: '#FEF3C7', color: '#92400E' },
  completed: { label: 'Completed', bg: '#D1FAE5', color: '#065F46' },
}

function StatusBadge({ status, statusSiteName, statusStartBy, scheduledTodayCustomer }: { status: EngineerStatus; statusSiteName: string | null; statusStartBy: string | null; scheduledTodayCustomer: string | null }) {
  const c = STATUS_CONFIG[status]
  const showsSite = status === 'on_the_way' || status === 'travelling' || status === 'reached' || status === 'completed'
  // A job scheduled for today takes priority over the plain "Available" label — an
  // engineer who hasn't tapped "On the way" yet still has something lined up, so
  // "Available" would be misleading.
  const scheduledToday = status === 'available' && scheduledTodayCustomer
  const label = scheduledToday ? `Scheduled to ${scheduledTodayCustomer}` : showsSite && statusSiteName ? `${c.label} — ${statusSiteName}` : c.label
  const bg = scheduledToday ? '#DBEAFE' : c.bg
  const color = scheduledToday ? '#1D4ED8' : c.color
  const showsStartBy = (status === 'on_the_way' || status === 'travelling') && statusStartBy
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: bg, color, whiteSpace: 'nowrap' }}>{label}</span>
      {showsStartBy && (
        <span style={{ fontSize: 10, color: 'var(--txm)' }}>Starting by {formatTime(statusStartBy)}</span>
      )}
    </div>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  engineers: FieldEngineerOverview[]
  userName: string
  userRole: string
  permissions?: Record<string, boolean>
  editableProfiles?: Profile[]
  managers?: Profile[]
}

export default function EngineersPageClient({ engineers, userName, userRole, permissions = {}, editableProfiles = [], managers = [] }: Props) {
  const router = useRouter()
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(engineers)

  // Field engineers ARE users, so managing them here reuses the Users add/edit modal
  // and the delete-user action (which removes them from the Users list too). Gated on
  // the 'Field Engineers — Manage' permission — Super Admin / Head of Service always
  // pass, and a role with no permissions configured falls open.
  const canManage = userRole === 'Super Admin' || userRole === 'Head of Service'
    || Object.keys(permissions).length === 0 || permissions['Field Engineers — Manage'] === true

  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<FieldEngineerOverview | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  function openEdit(engId: string) {
    const profile = editableProfiles.find(p => p.id === engId)
    if (!profile) { alert('This engineer’s full profile could not be loaded for editing.'); return }
    setEditUser(profile)
    setShowEdit(true)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await deleteUser(confirmDelete.id)
    setDeleting(false)
    if (error) { setDeleteError(error); return }
    setConfirmDelete(null)
    router.refresh()
  }

  return (
    <>
      <Topbar title="Field Engineers" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Field engineers</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, background: '#10B981', borderRadius: '50%' }} />
              <span style={{ fontSize: 11, color: 'var(--txm)' }}>Updated on page load</span>
            </div>
          </div>
          {engineers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No field engineers found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>
                    {['Engineer', 'Employee ID', 'Status', 'Last Seen', 'Next assigned project', 'Open', 'Completed', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <Link href={`/engineers/${e.id}`} style={{ color: 'var(--m)', textDecoration: 'none' }}>{e.name}</Link>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{e.employee_id}</td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={e.status} statusSiteName={e.statusSiteName} statusStartBy={e.statusStartBy} scheduledTodayCustomer={e.scheduledTodayCustomer} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)' }}>
                        {e.lastSeen ? (
                          <>
                            <div>{e.lastSeen.placeName || 'Location unavailable'}</div>
                            <div style={{ color: 'var(--txm)', fontSize: 10 }}>{formatDateTime(e.lastSeen.at)}</div>
                          </>
                        ) : <span style={{ color: 'var(--txm)' }}>No location yet</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)' }}>
                        {e.nextAssigned ? (
                          <>
                            <div>{e.nextAssigned.customerName || e.nextAssigned.woNumber}</div>
                            <div style={{ color: 'var(--txm)', fontSize: 10 }}>
                              {e.nextAssigned.scheduledDate ? new Date(e.nextAssigned.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                            </div>
                          </>
                        ) : <span style={{ color: 'var(--txm)' }}>No project assigned</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)', textAlign: 'center' }}>{e.openWorkOrders}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)', textAlign: 'center' }}>{e.completedToday}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => router.push(`/work-orders?engineer=${e.id}`)}
                            style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: 'var(--m)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}
                          >
                            View jobs
                          </button>
                          {canManage && (
                            <button onClick={() => openEdit(e.id)} title="Edit engineer"
                              style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" /></svg>
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => { setDeleteError(''); setConfirmDelete(e) }} title="Delete engineer"
                              style={{ background: '#FEF2F2', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <svg width="12" height="12" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
      </div>

      <AddUserModal
        key={editUser?.id ?? 'none'}
        open={showEdit}
        onClose={() => { setShowEdit(false); setEditUser(null) }}
        onSaved={() => router.refresh()}
        editUser={editUser}
        managers={managers}
        currentUserRole={userRole}
      />

      {confirmDelete && (
        <Modal open onClose={() => { if (!deleting) setConfirmDelete(null) }} title="Delete field engineer">
          <div style={{ fontSize: 13, color: 'var(--tx)', marginBottom: 8 }}>
            Delete <strong>{confirmDelete.name}</strong>? This removes their account entirely — they’ll disappear from the Users list too and can no longer sign in. This cannot be undone.
          </div>
          {deleteError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 10 }}>{deleteError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button onClick={() => setConfirmDelete(null)} disabled={deleting}
              style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#DC2626', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: deleting ? 0.7 : 1 }}>
              {deleting ? 'Deleting…' : 'Delete engineer'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
