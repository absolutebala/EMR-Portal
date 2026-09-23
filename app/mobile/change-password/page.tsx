'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { completeNewPassword } from '@/app/actions/complete-new-password'

// Cognito password policy (infra/lib/auth-stack.ts): min 8, upper, lower, digit, symbol.
function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  }
}
const REQUIREMENTS: { key: keyof ReturnType<typeof passwordChecks>; label: string }[] = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'upper', label: 'An uppercase letter (A–Z)' },
  { key: 'lower', label: 'A lowercase letter (a–z)' },
  { key: 'digit', label: 'A number (0–9)' },
  { key: 'symbol', label: 'A symbol (e.g. ! @ # $)' },
]

// Mobile-styled equivalent of /set-password — the page every temp-password user
// (freshly invited, or admin-reset) lands on after mobile login()'s
// NEW_PASSWORD_REQUIRED challenge. Cognito never issues real tokens for a
// temp-password account until this challenge is answered, so (unlike the old
// Supabase-based version of this page) there's no "already signed in, just update the
// password" state to detect first.
export default function MobileChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [phone, setPhone] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const checks = passwordChecks(password)
  const allMet = Object.values(checks).every(Boolean)
  const mismatch = confirm.length > 0 && password !== confirm
  const phoneValid = phone.replace(/\D/g, '').length >= 10
  const canSubmit = allMet && password === confirm && confirm.length > 0 && phoneValid && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allMet) {
      const missing = REQUIREMENTS.filter(r => !checks[r.key]).map(r => r.label.toLowerCase())
      setError(`Your password still needs: ${missing.join(', ')}.`)
      return
    }
    if (password !== confirm) { setError("The two passwords don't match."); return }
    if (!phoneValid) { setError('Enter a valid 10-digit mobile number.'); return }
    setSaving(true)
    setError('')
    const { error } = await completeNewPassword(password, { requireRole: 'Field Engineer', phone: phone.trim() })
    if (error) { setError(error); setSaving(false); return }
    window.location.href = '/mobile/dashboard'
  }

  const inputWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', border: '1.5px solid #E5E0E3', borderRadius: 10, overflow: 'hidden' }
  const bareInputStyle: React.CSSProperties = { flex: 1, padding: '13px 14px', border: 'none', fontSize: 15, outline: 'none', fontFamily: 'Poppins, sans-serif', background: 'transparent', minWidth: 0 }
  const eyeStyle: React.CSSProperties = { padding: '0 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(160deg, #3A0A1C 0%, #7D1D3F 60%, #A8294F 100%)',
      padding: '0 24px',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72,
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(12px)',
            border: '1.5px solid rgba(255,255,255,0.25)',
            borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="34" height="34" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>EMR Field</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: 300 }}>Field Engineer App</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1C0D14', margin: '0 0 4px' }}>Set your password</h2>
          <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 24 }}>Please set a permanent password to continue.</p>

          {error && (
            <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                New password
              </label>
              <div style={inputWrapStyle}>
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Min. 8 characters"
                  style={bareInputStyle}
                />
                <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} style={eyeStyle}>{show ? '🙈' : '👁'}</button>
              </div>
              {password.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {REQUIREMENTS.map(r => (
                    <div key={r.key} style={{ fontSize: 12, color: checks[r.key] ? '#047857' : '#9CA3AF' }}>
                      {checks[r.key] ? '✓' : '○'}&nbsp;&nbsp;{r.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Confirm password
              </label>
              <div style={{ ...inputWrapStyle, borderColor: mismatch ? '#DC2626' : '#E5E0E3' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                  style={bareInputStyle}
                />
                <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} style={eyeStyle}>{show ? '🙈' : '👁'}</button>
              </div>
              {mismatch && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>The two passwords don&apos;t match.</div>}
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Your mobile number
              </label>
              <div style={inputWrapStyle}>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d+\-\s]/g, ''))}
                  required
                  placeholder="10-digit mobile number"
                  style={bareInputStyle}
                />
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Required — used to send you a password-reset code if you ever forget it.</div>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '14px',
                background: !canSubmit ? '#C9AEB8' : '#7D1D3F',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 600,
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
                fontFamily: 'Poppins, sans-serif',
                transition: 'background 0.2s',
              }}
            >
              {saving ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 24, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
        EMR Global · Field Service Management
      </div>
    </div>
  )
}
