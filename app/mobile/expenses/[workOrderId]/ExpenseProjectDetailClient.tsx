'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { updateMyExpenseLog, deleteMyExpenseLog, getExpenseTypes } from '@/app/actions/expenses'
import type { ExpenseLogView, ExpenseType } from '@/lib/mobile/core/expenses'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  workOrderId: string
  logs: ExpenseLogView[]
  error: string | null
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  manager_approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Awaiting final approval' },
  approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}
const fi: React.CSSProperties = { padding: '11px 12px', border: '1.5px solid #E5E0E3', borderRadius: 9, fontSize: 14, color: '#1C0D14', outline: 'none', width: '100%', fontFamily: 'Poppins, sans-serif', background: '#fff' }
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#7A6870', marginBottom: 5, display: 'block' }

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ExpenseProjectDetailClient({ workOrderId, logs, error }: Props) {
  const router = useRouter()
  const total = logs.reduce((sum, l) => sum + l.amount, 0)
  const first = logs[0]

  const [editLog, setEditLog] = useState<ExpenseLogView | null>(null)
  const [editForm, setEditForm] = useState({ expenseTypeId: '', expenseDate: '', amount: '' })
  const [types, setTypes] = useState<ExpenseType[]>([])
  const [deleteLog, setDeleteLog] = useState<ExpenseLogView | null>(null)
  const [busy, setBusy] = useState(false)
  const [sheetError, setSheetError] = useState('')

  async function openEdit(log: ExpenseLogView) {
    setSheetError('')
    setEditForm({ expenseTypeId: log.expenseTypeId, expenseDate: log.expenseDate, amount: String(log.amount) })
    setEditLog(log)
    if (!types.length) { const { types: t } = await getExpenseTypes(); setTypes(t) }
  }

  async function saveEdit() {
    if (!editLog) return
    const amount = Number(editForm.amount)
    if (!(amount > 0)) { setSheetError('Enter a valid amount.'); return }
    setBusy(true); setSheetError('')
    const { error: e } = await updateMyExpenseLog(editLog.id, { expenseTypeId: editForm.expenseTypeId, expenseDate: editForm.expenseDate, amount })
    setBusy(false)
    if (e) { setSheetError(e); return }
    setEditLog(null)
    router.refresh()
  }

  async function confirmDelete() {
    if (!deleteLog) return
    setBusy(true); setSheetError('')
    const { error: e } = await deleteMyExpenseLog(deleteLog.id)
    setBusy(false)
    if (e) { setSheetError(e); return }
    setDeleteLog(null)
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title={first?.projectLabel || 'Project expenses'} subtitle={first ? `${first.woNumber} · ${first.customerName}` : undefined} backHref="/mobile/expenses" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 160 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 11, padding: '12px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#7D1D3F' }}>{logs.length} log{logs.length !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#7D1D3F' }}>{formatAmount(total)}</span>
        </div>

        {logs.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No expense logs for this project.</div>
          </div>
        )}

        {logs.map(log => (
          <div key={log.id} style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{log.expenseTypeName}</div>
                <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>{formatDate(log.expenseDate)}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1C0D14', flexShrink: 0 }}>{formatAmount(log.amount)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: STATUS_CFG[log.status].bg, color: STATUS_CFG[log.status].color }}>
                {STATUS_CFG[log.status].label}
              </span>
              {log.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={log.photoUrl} alt="Receipt" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid #E5E0E3' }} />
              )}
            </div>
            {log.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, borderTop: '1px solid #F2EBEE', paddingTop: 10 }}>
                <button className="mtap" onClick={() => openEdit(log)}
                  style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  Edit
                </button>
                <button className="mtap" onClick={() => { setSheetError(''); setDeleteLog(log) }}
                  style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ position: 'fixed', bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, background: '#fff', borderTop: '1px solid #E5E0E3', padding: '12px 16px' }}>
        <button
          className="mtap"
          onClick={() => router.push(`/mobile/expenses/new?wo=${workOrderId}`)}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          Add another expense
        </button>
      </div>

      {/* Edit sheet */}
      {editLog && (
        <div onClick={() => !busy && setEditLog(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', borderRadius: '18px 18px 0 0', padding: '18px 16px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1C0D14', marginBottom: 14 }}>Edit expense</div>
            {sheetError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 9, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>{sheetError}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={fl}>Expense type</label>
              <select style={fi} value={editForm.expenseTypeId} onChange={e => setEditForm(f => ({ ...f, expenseTypeId: e.target.value }))}>
                {!types.some(t => t.id === editForm.expenseTypeId) && <option value={editForm.expenseTypeId}>{editLog.expenseTypeName}</option>}
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={fl}>Date</label>
              <input type="date" style={fi} value={editForm.expenseDate} max={todayIso()} onChange={e => setEditForm(f => ({ ...f, expenseDate: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={fl}>Amount (₹)</label>
              <input type="number" inputMode="decimal" min="0" step="0.01" style={fi} value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="mtap" onClick={() => setEditLog(null)} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: '1px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Cancel</button>
              <button className="mtap" onClick={saveEdit} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', opacity: busy ? .7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteLog && (
        <div onClick={() => !busy && setDeleteLog(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 360, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1C0D14', marginBottom: 8 }}>Delete expense</div>
            {sheetError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 9, padding: '10px 12px', fontSize: 12, marginBottom: 10 }}>{sheetError}</div>}
            <div style={{ fontSize: 13, color: '#4A3A41', marginBottom: 16 }}>Delete this {formatAmount(deleteLog.amount)} {deleteLog.expenseTypeName} expense? This can&apos;t be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="mtap" onClick={() => setDeleteLog(null)} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: '1px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Cancel</button>
              <button className="mtap" onClick={confirmDelete} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: 'none', background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', opacity: busy ? .7 : 1 }}>{busy ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
