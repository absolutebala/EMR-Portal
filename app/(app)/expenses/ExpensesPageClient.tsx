'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { ListCard } from '@/components/dashboard/DashboardCards'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import { submitManagerDecision, submitHeadDecision, updateExpenseLog, deleteExpenseLog, getExpenseTypes } from '@/app/actions/expenses'
import type { ExpenseLogView, ExpenseType } from '@/lib/mobile/core/expenses'
import { CITY_TIER_LABEL } from '@/lib/travelGuidelines'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function monthStartIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  manager_approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Awaiting final approval' },
  approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}

type TabId = 'all' | 'pending' | 'manager_approved' | 'approved' | 'rejected'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BarRow({ label, amount, max, color }: { label: string; amount: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((amount / max) * 100)) : 0
  return (
    <div style={{ padding: '9px 14px', borderTop: '1px solid var(--gl)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{formatAmount(amount)}</div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--gl)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color }} />
      </div>
    </div>
  )
}

interface Props {
  logs: ExpenseLogView[]
  userName: string
  userRole: string
  canApproveAsManager: boolean
  canApproveAsHead: boolean
  canManage: boolean
}

export default function ExpensesPageClient({ logs, userName, userRole, canApproveAsManager, canApproveAsHead, canManage }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('all')
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  // Edit / delete / export
  const [editLog, setEditLog] = useState<ExpenseLogView | null>(null)
  const [editForm, setEditForm] = useState({ expenseTypeId: '', expenseDate: '', amount: '' })
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [deleteTarget, setDeleteTarget] = useState<ExpenseLogView | null>(null)
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [exportFrom, setExportFrom] = useState(monthStartIso())
  const [exportTo, setExportTo] = useState(todayIso())

  async function openEdit(log: ExpenseLogView) {
    setModalError('')
    setEditForm({ expenseTypeId: log.expenseTypeId, expenseDate: log.expenseDate, amount: String(log.amount) })
    setEditLog(log)
    if (!expenseTypes.length) {
      const { types } = await getExpenseTypes()
      setExpenseTypes(types)
    }
  }

  async function saveEdit() {
    if (!editLog) return
    const amount = Number(editForm.amount)
    if (!(amount > 0)) { setModalError('Enter a valid amount.'); return }
    setBusy(true); setModalError('')
    const { error } = await updateExpenseLog(editLog.id, { expenseTypeId: editForm.expenseTypeId, expenseDate: editForm.expenseDate, amount })
    setBusy(false)
    if (error) { setModalError(error); return }
    setEditLog(null)
    router.refresh()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true); setModalError('')
    const { error } = await deleteExpenseLog(deleteTarget.id)
    setBusy(false)
    if (error) { setModalError(error); return }
    setDeleteTarget(null)
    router.refresh()
  }

  function runExport() {
    const from = exportFrom, to = exportTo
    const rows = logs
      .filter(l => l.expenseDate >= from && l.expenseDate <= to)
      .sort((a, b) => (a.expenseDate < b.expenseDate ? -1 : 1))
    const header = ['Engineer', 'Grade', 'Project', 'WO Number', 'Customer', 'Expense Type', 'Date', 'Amount', 'Claim Type', 'City Tier', 'Eligible Limit', 'Over Limit', 'Status', 'Approved By (Stage 1)', 'Reviewed By', 'Submitted On']
    const aoa = [
      header,
      ...rows.map(l => [
        l.engineerName || '', l.engineerGrade || '', l.projectLabel, l.woNumber, l.customerName, l.expenseTypeName,
        l.expenseDate, l.amount, l.claimType ? (l.claimType === 'flat' ? 'Flat' : 'Actuals') : '',
        l.cityTier ? CITY_TIER_LABEL[l.cityTier] : '', l.eligibleLimit ?? '', l.overLimit ? 'Yes' : '',
        STATUS_CFG[l.status].label, l.managerApprovedByName || '', l.reviewedByName || '', formatDate(l.createdAt),
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = header.map(() => ({ wch: 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
    XLSX.writeFile(wb, `expenses_${from}_to_${to}.xlsx`)
    setShowExport(false)
  }

  async function actManager(id: string, decision: 'approve' | 'reject') {
    setActingId(id)
    await submitManagerDecision(id, decision)
    setActingId(null)
    router.refresh()
  }

  async function actHead(id: string, decision: 'approve' | 'reject') {
    setActingId(id)
    await submitHeadDecision(id, decision)
    setActingId(null)
    router.refresh()
  }

  const counts: Record<TabId, number> = {
    all: logs.length,
    pending: logs.filter(l => l.status === 'pending').length,
    manager_approved: logs.filter(l => l.status === 'manager_approved').length,
    approved: logs.filter(l => l.status === 'approved').length,
    rejected: logs.filter(l => l.status === 'rejected').length,
  }
  const filtered = tab === 'all' ? logs : logs.filter(l => l.status === tab)
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered)

  // Spend charts count all claims regardless of status.
  const typeSpend = Object.entries(
    logs.reduce((acc, l) => { acc[l.expenseTypeName] = (acc[l.expenseTypeName] || 0) + l.amount; return acc }, {} as Record<string, number>)
  ).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  const engineerSpend = Object.entries(
    logs.reduce((acc, l) => {
      const name = l.engineerName || 'Unassigned'
      acc[name] = (acc[name] || 0) + l.amount
      return acc
    }, {} as Record<string, number>)
  ).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  const typeMax = typeSpend[0]?.amount || 0
  const engineerMax = engineerSpend[0]?.amount || 0

  // Over-limit shown regardless of status — including already-decided claims — so
  // this is a full risk picture, not just what's still awaiting a decision.
  const overLimitLogs = logs.filter(l => l.overLimit).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return (
    <>
      <Topbar title="Expenses" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 }}>
          <ListCard title="Spend by expense type" empty="No expenses yet.">
            {typeSpend.map(t => <BarRow key={t.name} label={t.name} amount={t.amount} max={typeMax} color="#7D1D3F" />)}
          </ListCard>

          <ListCard title="Spend by field engineer" empty="No expenses yet.">
            {engineerSpend.map(e => <BarRow key={e.name} label={e.name} amount={e.amount} max={engineerMax} color="#1D4ED8" />)}
          </ListCard>

          <ListCard title="Over policy limit" empty="No claims over their eligible limit.">
            {overLimitLogs.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Expense Type', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overLimitLogs.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--gl)' }}>
                      <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{l.engineerName || '—'}</div>
                        {l.engineerGrade && <div style={{ fontSize: 10, color: 'var(--txm)' }}>{l.engineerGrade}</div>}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: 'var(--tx)', verticalAlign: 'top' }}>{l.expenseTypeName}</td>
                      <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#991B1B' }}>{formatAmount(l.amount)}</div>
                        <div style={{ fontSize: 10, color: 'var(--txm)' }}>{l.eligibleLimit != null ? `Eligible ${formatAmount(l.eligibleLimit)}` : ''}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ListCard>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'pending', 'manager_approved', 'approved', 'rejected'] as TabId[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${tab === t ? 'var(--m)' : 'var(--gm)'}`,
                  background: tab === t ? 'var(--m)' : '#fff', color: tab === t ? '#fff' : 'var(--tx)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
                }}
              >
                {t === 'all' ? 'All' : STATUS_CFG[t].label} ({counts[t]})
              </button>
            ))}
          </div>
          {canManage && (
            <button onClick={() => { setExportFrom(monthStartIso()); setExportTo(todayIso()); setShowExport(true) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export to Excel
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13, background: '#fff', borderRadius: 10, border: '1px solid var(--gm)' }}>
            No expenses{tab !== 'all' ? ` in "${STATUS_CFG[tab].label}"` : ''} yet.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Engineer', 'Project', 'Type', 'Date', 'Amount', 'Receipt', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, color: 'var(--tx)' }}>{log.engineerName || '—'}</div>
                      {log.engineerGrade && <div style={{ fontSize: 10, color: 'var(--txm)' }}>{log.engineerGrade}</div>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{log.projectLabel}</div>
                      <div style={{ fontSize: 10, color: 'var(--txm)' }}>{log.woNumber} · {log.customerName}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{log.expenseTypeName}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{formatDate(log.expenseDate)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: log.overLimit ? '#991B1B' : 'var(--tx)' }}>{formatAmount(log.amount)}</div>
                      {log.claimType && (
                        <div style={{ fontSize: 9, color: 'var(--txm)', marginTop: 2 }}>
                          {log.claimType === 'flat' ? 'Flat' : 'Actuals'}{log.cityTier ? ` · ${CITY_TIER_LABEL[log.cityTier]}` : ''}
                          {log.eligibleLimit != null && ` · Eligible ${formatAmount(log.eligibleLimit)}`}
                        </div>
                      )}
                      {log.overLimit && (
                        <span style={{ display: 'inline-block', marginTop: 3, fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, background: '#FEE2E2', color: '#991B1B' }}>
                          Over limit
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {log.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={log.photoUrl} alt="Receipt" onClick={() => setEnlargedPhoto(log.photoUrl)}
                          style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--gm)', cursor: 'pointer' }} />
                      ) : <span style={{ fontSize: 11, color: 'var(--txm)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: STATUS_CFG[log.status].bg, color: STATUS_CFG[log.status].color, whiteSpace: 'nowrap' }}>
                        {STATUS_CFG[log.status].label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {log.status === 'pending' && canApproveAsManager ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button disabled={actingId === log.id} onClick={() => actManager(log.id, 'approve')}
                            style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === log.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#D1FAE5', color: '#065F46', whiteSpace: 'nowrap' }}>
                            Approve
                          </button>
                          <button disabled={actingId === log.id} onClick={() => actManager(log.id, 'reject')}
                            style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === log.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#FEE2E2', color: '#991B1B', whiteSpace: 'nowrap' }}>
                            Reject
                          </button>
                        </div>
                      ) : log.status === 'manager_approved' && canApproveAsHead ? (
                        <div>
                          {log.managerApprovedByName && (
                            <div style={{ fontSize: 9, color: 'var(--txm)', marginBottom: 4 }}>Approved by {log.managerApprovedByName}</div>
                          )}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button disabled={actingId === log.id} onClick={() => actHead(log.id, 'approve')}
                              style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === log.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#D1FAE5', color: '#065F46', whiteSpace: 'nowrap' }}>
                              Final approve
                            </button>
                            <button disabled={actingId === log.id} onClick={() => actHead(log.id, 'reject')}
                              style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === log.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#FEE2E2', color: '#991B1B', whiteSpace: 'nowrap' }}>
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : log.status === 'manager_approved' ? (
                        <span style={{ fontSize: 10, color: 'var(--txm)' }}>
                          {log.managerApprovedByName ? `Approved by ${log.managerApprovedByName}, ` : ''}awaiting final approval
                        </span>
                      ) : (log.status === 'approved' || log.status === 'rejected') && log.reviewedByName ? (
                        <span style={{ fontSize: 10, color: 'var(--txm)' }}>by {log.reviewedByName}</span>
                      ) : null}
                      {canManage && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button title="Edit expense" onClick={() => openEdit(log)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
                          </button>
                          <button title="Delete expense" onClick={() => { setModalError(''); setDeleteTarget(log) }}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
      </div>

      <Modal open={!!enlargedPhoto} onClose={() => setEnlargedPhoto(null)} title="Receipt photo" size="lg">
        {enlargedPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enlargedPhoto} alt="Receipt" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
        )}
      </Modal>

      {/* Edit expense */}
      <Modal open={!!editLog} onClose={() => setEditLog(null)} title="Edit expense" size="md"
        footer={
          <>
            <button onClick={() => setEditLog(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
            <button onClick={saveEdit} disabled={busy} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: busy ? .7 : 1 }}>{busy ? 'Saving…' : 'Save changes'}</button>
          </>
        }>
        {editLog && (
          <div>
            {modalError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{modalError}</div>}
            <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 14 }}>{editLog.engineerName || '—'} · {editLog.projectLabel}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fl}>Expense type</label>
                <select style={fi} value={editForm.expenseTypeId} onChange={e => setEditForm(f => ({ ...f, expenseTypeId: e.target.value }))}>
                  {!expenseTypes.some(t => t.id === editForm.expenseTypeId) && <option value={editForm.expenseTypeId}>{editLog.expenseTypeName}</option>}
                  {expenseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={fl}>Date</label>
                <input type="date" style={fi} value={editForm.expenseDate} max={todayIso()} onChange={e => setEditForm(f => ({ ...f, expenseDate: e.target.value }))} />
              </div>
              <div>
                <label style={fl}>Amount (₹)</label>
                <input type="number" min="0" step="0.01" style={fi} value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete expense" size="sm"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
            <button onClick={confirmDelete} disabled={busy} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: busy ? .7 : 1 }}>{busy ? 'Deleting…' : 'Delete expense'}</button>
          </>
        }>
        {deleteTarget && (
          <div>
            {modalError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 10 }}>{modalError}</div>}
            <div style={{ fontSize: 13, color: 'var(--tx)' }}>
              Delete this <strong>{formatAmount(deleteTarget.amount)}</strong> {deleteTarget.expenseTypeName} expense for {deleteTarget.engineerName || 'this engineer'}? This can&apos;t be undone.
            </div>
          </div>
        )}
      </Modal>

      {/* Export to Excel — date range */}
      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export expenses to Excel" size="sm"
        footer={
          <>
            <button onClick={() => setShowExport(false)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
            <button onClick={runExport} disabled={!exportFrom || !exportTo || exportFrom > exportTo} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: (!exportFrom || !exportTo || exportFrom > exportTo) ? .6 : 1 }}>Download Excel</button>
          </>
        }>
        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14 }}>Choose the date range (by expense date) to export.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={fl}>From</label>
            <input type="date" style={fi} value={exportFrom} max={exportTo || undefined} onChange={e => setExportFrom(e.target.value)} />
          </div>
          <div>
            <label style={fl}>To</label>
            <input type="date" style={fi} value={exportTo} min={exportFrom || undefined} onChange={e => setExportTo(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 12 }}>
          {logs.filter(l => l.expenseDate >= exportFrom && l.expenseDate <= exportTo).length.toLocaleString()} expense(s) in this range.
        </div>
      </Modal>
    </>
  )
}

const fi: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }
