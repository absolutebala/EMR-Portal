'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { changeMyPassword } from '@/app/actions/update-my-profile'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 14, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }

// Voluntary password change for an already-signed-in engineer, reached from the
// account menu — distinct from /mobile/change-password, which completes Cognito's
// NEW_PASSWORD_REQUIRED challenge for a temp-password account and has no signed-in
// session to work with yet.
export default function AccountPasswordClient() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    setError('')
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirm) { setError('New passwords do not match.'); return }
    setSaving(true)
    const { error: err } = await changeMyPassword(currentPassword, newPassword)
    setSaving(false)
    if (err) { setError(err); return }
    setSuccess(true)
    setCurrentPassword(''); setNewPassword(''); setConfirm('')
  }

  if (success) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
        <MobileHeader title="Change Password" backHref="/mobile/dashboard" />
        <div style={{ flex: 1, overflowY: 'auto', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1C0D14', marginBottom: 8 }}>Password updated</div>
          <div style={{ fontSize: 13, color: '#7A6870', marginBottom: 24 }}>Use your new password next time you sign in.</div>
          <button
            className="mtap"
            onClick={() => router.push('/mobile/dashboard')}
            style={{ padding: '13px 28px', borderRadius: 12, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            Done
          </button>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Change Password" backHref="/mobile/dashboard" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {error && <div style={{ color: '#DC2626', fontSize: 12.5, textAlign: 'center', marginBottom: 14 }}>{error}</div>}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Current password</label>
          <input type="password" style={inputStyle} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>New password</label>
          <input type="password" style={inputStyle} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Confirm new password</label>
          <input type="password" style={inputStyle} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter new password" />
        </div>

        <button
          className="mtap"
          onClick={handleSubmit}
          disabled={saving}
          style={{
            width: '100%', padding: 15, borderRadius: 12, border: 'none',
            background: saving ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 15, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif',
          }}
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
