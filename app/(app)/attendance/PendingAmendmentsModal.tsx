'use client'

import type { PendingAmendment } from '@/lib/mobile/core/attendance'

interface Props {
  amendments: PendingAmendment[]
  actingOn: string | null
  onDecision: (id: string, decision: 'approved' | 'rejected') => void
  onClose: () => void
}

export default function PendingAmendmentsModal({ amendments, actingOn, onDecision, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', width: 480, maxWidth: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Pending attendance amendments ({amendments.length})</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--txm)', padding: 4 }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto' }}>
          {amendments.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: i < amendments.length - 1 ? '1px solid var(--gl)' : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{a.engineerName} — {a.attendanceDate}</div>
                <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 2 }}>
                  {a.markedAt ? new Date(a.markedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  {a.placeName ? ` · ${a.placeName}` : ''}
                </div>
                {a.reason && <div style={{ fontSize: 11, color: 'var(--tx)', marginTop: 4 }}>Reason: {a.reason}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onDecision(a.id, 'approved')}
                  disabled={actingOn === a.id}
                  style={{ background: '#D1FAE5', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#065F46', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => onDecision(a.id, 'rejected')}
                  disabled={actingOn === a.id}
                  style={{ background: '#FEE2E2', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#991B1B', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
