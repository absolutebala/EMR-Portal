'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import AddCustomerModal from '@/components/customers/AddCustomerModal'
import BulkUploadCustomersModal from '@/components/customers/BulkUploadCustomersModal'
import NewWorkOrderModal from '@/components/work-orders/NewWorkOrderModal'
import { CustomerTypeBadge } from '@/components/ui/Badge'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import { deleteCustomer, type BlockingNotification } from '@/app/actions/save-customer'
import type { Customer } from '@/lib/types'

const COLORS = ['#7D1D3F', '#5B6AC4', '#0891B2', '#D97706', '#059669', '#7C3AED']

interface CustomerWithCounts extends Customer {
  site_count: number
  sn_count: number
}

interface Props {
  customers: CustomerWithCounts[]
  userName: string
  userRole: string
}

export default function CustomersPageClient({ customers, userName, userRole }: Props) {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [woCustomer, setWoCustomer] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const router = useRouter()
  const canDelete = userRole === 'Super Admin' || userRole === 'Head of Service'

  const filtered = useMemo(() => customers.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.contact_person.toLowerCase().includes(q) || c.phone.includes(q)
  }), [customers, search])

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered)

  // When a customer still has notifications, deleteCustomer returns them instead of
  // deleting — this holds them so the modal can list them (as links) and offer to
  // remove the customer + those notifications together.
  const [blockingFor, setBlockingFor] = useState<{ id: string; name: string; notifications: BlockingNotification[] } | null>(null)

  async function handleDelete(customer: Customer, cascade = false) {
    setDeleting(customer.id)
    setDeleteError('')
    const res = await deleteCustomer(customer.id, cascade ? { cascade: true } : undefined)
    setDeleting(null)
    if (res.error) { setConfirmDelete(null); setBlockingFor(null); setDeleteError(res.error); return }
    if (res.blockingNotifications && res.blockingNotifications.length > 0) {
      setConfirmDelete(null)
      setBlockingFor({ id: customer.id, name: customer.name, notifications: res.blockingNotifications })
      return
    }
    setConfirmDelete(null)
    setBlockingFor(null)
    router.refresh()
  }

  function getInitials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }

  return (
    <>
      <Topbar title="Customers" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '7px 12px' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--tx)', background: 'transparent', fontFamily: 'Poppins,sans-serif', width: 220 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowUpload(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload CSV
            </button>
            <button onClick={() => { setEditCustomer(null); setShowAdd(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Customer
            </button>
          </div>
        </div>

        {deleteError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{deleteError}</div>}

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No customers found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Customer', 'Type', 'End Customer Type', 'Contact', 'Phone', 'Projects', 'Serial numbers', 'Last service', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--gm)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--mp)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                    <td style={{ padding: '10px 14px' }} onClick={() => router.push(`/customers/${c.id}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {getInitials(c.name)}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--m)' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}><CustomerTypeBadge type={c.type} /></td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{c.end_customer_type_name || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{c.contact_person}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{c.phone}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)', textAlign: 'center' }}>{c.site_count}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)', textAlign: 'center' }}>{c.sn_count}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>—</td>
                    <td style={{ padding: '10px 14px' }}>
                      {confirmDelete === c.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--txm)', whiteSpace: 'nowrap' }}>Delete?</span>
                          <button
                            onClick={() => handleDelete(c)}
                            disabled={deleting === c.id}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: deleting === c.id ? .7 : 1 }}
                          >
                            {deleting === c.id ? '…' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => router.push(`/customers/${c.id}`)} title="View" style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                          <button onClick={() => { setEditCustomer(c); setShowAdd(true) }} title="Edit" style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" /></svg>
                          </button>
                          {canDelete && (
                            <button onClick={() => { setDeleteError(''); setConfirmDelete(c.id) }} title="Delete" style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <svg width="12" height="12" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />

        <AddCustomerModal
          open={showAdd}
          onClose={() => { setShowAdd(false); setEditCustomer(null) }}
          onSaved={() => router.refresh()}
          editCustomer={editCustomer}
          onCreateWorkOrder={(id, name) => { setShowAdd(false); setEditCustomer(null); setWoCustomer({ id, name }) }}
        />
        <BulkUploadCustomersModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onSaved={() => router.refresh()}
        />
        <NewWorkOrderModal
          open={!!woCustomer}
          onClose={() => setWoCustomer(null)}
          onSaved={() => { setWoCustomer(null); router.refresh() }}
          prefillCustomerId={woCustomer?.id}
          prefillCustomerName={woCustomer?.name}
        />

        <Modal
          open={!!blockingFor}
          onClose={() => setBlockingFor(null)}
          title="Customer has notifications"
          footer={
            <>
              <button onClick={() => setBlockingFor(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
              <button
                onClick={() => { const c = customers.find(x => x.id === blockingFor?.id); if (c) handleDelete(c, true) }}
                disabled={!!blockingFor && deleting === blockingFor.id}
                style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: blockingFor && deleting === blockingFor.id ? .7 : 1 }}
              >
                {blockingFor && deleting === blockingFor.id ? 'Deleting…' : `Delete customer & ${blockingFor?.notifications.length ?? 0} notification${(blockingFor?.notifications.length ?? 0) === 1 ? '' : 's'}`}
              </button>
            </>
          }
        >
          {blockingFor && (
            <div style={{ fontSize: 13, color: 'var(--tx)' }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
                <strong>{blockingFor.name}</strong> still has {blockingFor.notifications.length} notification{blockingFor.notifications.length === 1 ? '' : 's'} linked to it. Deleting the customer will also permanently delete {blockingFor.notifications.length === 1 ? 'this notification' : 'these notifications'} and everything under {blockingFor.notifications.length === 1 ? 'it' : 'them'} (check-ins, closures, forms).
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {blockingFor.notifications.map(n => (
                  <Link
                    key={n.id}
                    href={`/work-orders/${n.id}`}
                    style={{ fontSize: 12, fontWeight: 500, color: '#7D1D3F', textDecoration: 'none', border: '1px solid var(--gm)', borderRadius: 20, padding: '4px 12px', background: 'var(--gl)' }}
                  >
                    {n.woNumber} →
                  </Link>
                ))}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--txm)' }}>Open any notification above to review it first. This action can’t be undone.</p>
            </div>
          )}
        </Modal>
      </div>
    </>
  )
}
