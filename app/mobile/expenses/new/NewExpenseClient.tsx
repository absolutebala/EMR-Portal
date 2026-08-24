'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import PhotoField from '@/components/mobile/PhotoField'
import ExpenseTypePicker from '@/components/mobile/ExpenseTypePicker'
import { submitExpenseLog, getExpenseEligibility } from '@/app/actions/expenses'
import type { BLEligibility } from '@/lib/mobile/core/expenses'
import { CITY_TIER_LABEL } from '@/lib/travelGuidelines'
import type { MobileWorkOrder } from '@/lib/mobile/core/shared'
import type { ClaimType } from '@/lib/travelGuidelines'

interface Props {
  workOrders: MobileWorkOrder[]
  error: string | null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif',
  background: '#fff', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }

function todayLocal() {
  return new Date().toLocaleDateString('en-CA')
}

export default function NewExpenseClient({ workOrders, error }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [workOrderId, setWorkOrderId] = useState(searchParams.get('wo') || '')
  const [expenseTypeId, setExpenseTypeId] = useState('')
  const [expenseTypeName, setExpenseTypeName] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayLocal())
  const [amount, setAmount] = useState('')
  const [photo, setPhoto] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isLodging = /lodging|boarding/i.test(expenseTypeName)
  const [claimType, setClaimType] = useState<ClaimType>('flat')
  const [eligibility, setEligibility] = useState<BLEligibility | null>(null)

  useEffect(() => {
    if (!workOrderId || !isLodging) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEligibility(null)
      return
    }
    getExpenseEligibility(workOrderId).then(({ eligibility: e }) => {
      setEligibility(e)
      if (e?.grade) {
        const preferFlat = e.flatAvailable
        setClaimType(preferFlat ? 'flat' : 'actual')
        if (preferFlat && e.flatLimit != null && !amount) setAmount(String(e.flatLimit))
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId, isLodging])

  function handleClaimTypeChange(type: ClaimType) {
    setClaimType(type)
    if (type === 'flat' && eligibility?.flatLimit != null) setAmount(String(eligibility.flatLimit))
  }

  async function handleSubmit() {
    setSubmitError('')
    if (!workOrderId) { setSubmitError('Select the project'); return }
    if (!expenseTypeId) { setSubmitError('Select or add an expense type'); return }
    if (!expenseDate) { setSubmitError('Select a date'); return }
    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) { setSubmitError('Enter a valid amount'); return }

    if (isLodging && eligibility?.grade && claimType === 'actual' && !photo) {
      setSubmitError('A bill/receipt photo is required for an actuals claim')
      return
    }

    setSubmitting(true)
    const result = await submitExpenseLog({
      workOrderId,
      expenseTypeId,
      expenseDate,
      amount: amountNum,
      claimType: isLodging && eligibility?.grade ? claimType : undefined,
      photo: photo ? { base64: photo, mimeType: 'image/jpeg', ext: 'jpg' } : undefined,
    })
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
        <MobileHeader title="Expense Logged" backHref="/mobile/expenses" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <svg width="26" height="26" fill="none" stroke="#059669" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1C0D14', marginBottom: 4 }}>Expense logged</p>
          <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 20 }}>Your supervisor will review it shortly.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="mtap"
              onClick={() => router.push(`/mobile/expenses/${workOrderId}`)}
              style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              View project logs
            </button>
            <button
              className="mtap"
              onClick={() => { setSubmitted(false); setAmount(''); setPhoto(''); setExpenseTypeId(''); setExpenseTypeName(''); setExpenseDate(todayLocal()) }}
              style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              Add another
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Add Expense" backHref="/mobile/expenses" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 160 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <label style={labelStyle}>Project <span style={{ color: '#7D1D3F' }}>*</span></label>
          <select value={workOrderId} onChange={e => setWorkOrderId(e.target.value)} style={inputStyle}>
            <option value="">Select a project…</option>
            {workOrders.map(wo => (
              <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.site_name || wo.customer_name}</option>
            ))}
          </select>
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <label style={labelStyle}>Expense type <span style={{ color: '#7D1D3F' }}>*</span></label>
          <ExpenseTypePicker valueId={expenseTypeId} valueName={expenseTypeName} onChange={(id, name) => { setExpenseTypeId(id); setExpenseTypeName(name) }} />
        </div>

        {isLodging && eligibility?.grade && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <label style={labelStyle}>Claim type</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {eligibility.flatAvailable && (
                <button
                  type="button"
                  className="mtap"
                  onClick={() => handleClaimTypeChange('flat')}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${claimType === 'flat' ? '#7D1D3F' : '#E5E0E3'}`,
                    background: claimType === 'flat' ? '#F9EEF2' : '#fff', color: claimType === 'flat' ? '#7D1D3F' : '#7A6870',
                    fontFamily: 'Poppins, sans-serif',
                  }}
                >
                  Flat allowance
                </button>
              )}
              <button
                type="button"
                className="mtap"
                onClick={() => handleClaimTypeChange('actual')}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${claimType === 'actual' ? '#7D1D3F' : '#E5E0E3'}`,
                  background: claimType === 'actual' ? '#F9EEF2' : '#fff', color: claimType === 'actual' ? '#7D1D3F' : '#7A6870',
                  fontFamily: 'Poppins, sans-serif',
                }}
              >
                Actuals (bill required)
              </button>
            </div>
            <p style={{ fontSize: 10, color: '#7A6870', margin: 0, lineHeight: 1.5 }}>
              {eligibility.grade} · {CITY_TIER_LABEL[eligibility.cityTier]}
              {claimType === 'flat' && eligibility.flatLimit != null && ` · Eligible up to ₹${eligibility.flatLimit}, no bill needed`}
              {claimType === 'actual' && (eligibility.actualLimit != null
                ? ` · Eligible up to ₹${eligibility.actualLimit} against bills`
                : ' · No fixed cap — reimbursed against bills')}
            </p>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)', display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Date <span style={{ color: '#7D1D3F' }}>*</span></label>
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} max={todayLocal()} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Amount (₹) <span style={{ color: '#7D1D3F' }}>*</span></label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 8 }}>
            Receipt photo{' '}
            {isLodging && eligibility?.grade && claimType === 'actual'
              ? <span style={{ fontSize: 10, fontWeight: 400, color: '#7D1D3F' }}>(required for actuals)</span>
              : <span style={{ fontSize: 10, fontWeight: 400, color: '#7A6870' }}>(optional)</span>}
          </p>
          <PhotoField value={photo} onChange={setPhoto} />
        </div>

        {submitError && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12 }}>{submitError}</div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, background: '#fff', borderTop: '1px solid #E5E0E3', padding: '12px 16px' }}>
        <button
          className="mtap"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: submitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          {submitting ? 'Saving…' : 'Save expense'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
