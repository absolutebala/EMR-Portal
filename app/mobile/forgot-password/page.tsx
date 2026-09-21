'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Cognito password policy (infra/lib/auth-stack.ts): min 8, upper, lower, digit, symbol.
function policyError(pw: string): string | null {
  if (pw.length < 8) return 'at least 8 characters'
  if (!/[A-Z]/.test(pw)) return 'an uppercase letter'
  if (!/[a-z]/.test(pw)) return 'a lowercase letter'
  if (!/[0-9]/.test(pw)) return 'a number'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'a symbol'
  return null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 14px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 15, outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box',
}

function EyeButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? 'Hide password' : 'Show password'}
      style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#8A7C82', padding: 0 }}
    >
      {shown ? (
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      ) : (
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  )
}

// Two-step self-service reset (see lib/mobile/core/passwordReset.ts). The request step
// always advances regardless of whether the number matched an account (anti-enumeration).
export default function MobileForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function sendOtp() {
    if (phone.replace(/\D/g, '').length < 10) { setError('Enter your registered 10-digit mobile number'); return }
    setLoading(true); setError('')
    try {
      await fetch('/api/mobile/v1/auth/forgot-password/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: phone.trim() }),
      })
    } catch { /* best-effort; advance regardless */ }
    setLoading(false)
    setStep('reset')
  }

  async function resetPassword() {
    if (!/^\d{6}$/.test(otp.trim())) { setError('Enter the 6-digit code from the SMS'); return }
    const pErr = policyError(password)
    if (pErr) { setError(`Password needs ${pErr}`); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/mobile/v1/auth/forgot-password/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: phone.trim(), otp: otp.trim(), newPassword: password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError((body as { error?: string }).error || 'Could not reset your password'); setLoading(false); return }
      setDone(true)
    } catch {
      setError('Could not reset your password. Check your connection and try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, #3A0A1C 0%, #7D1D3F 60%, #A8294F 100%)', padding: '0 24px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 32 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1C0D14', margin: '0 0 4px' }}>Reset password</h2>

          {done ? (
            <>
              <p style={{ fontSize: 13, color: '#7A6870', marginBottom: 20 }}>Your password has been reset. Sign in with your new password.</p>
              <button onClick={() => router.replace('/mobile/login')} style={{ width: '100%', padding: 14, background: '#7D1D3F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Back to sign in</button>
            </>
          ) : step === 'request' ? (
            <>
              <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 20 }}>Enter your registered mobile number. We&apos;ll text you a 6-digit code.</p>
              {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Mobile number</label>
              <input type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765 43210" style={{ ...inputStyle, marginBottom: 20 }} />
              <button onClick={sendOtp} disabled={loading} style={{ width: '100%', padding: 14, background: loading ? '#A8294F' : '#7D1D3F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}>{loading ? 'Sending…' : 'Send code'}</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 20 }}>Enter the code we texted to {phone.trim()} and choose a new password.</p>
              {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>6-digit code</label>
              <input inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="123456" style={{ ...inputStyle, marginBottom: 16, letterSpacing: 4 }} />
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>New password</label>
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, padding: '13px 48px 13px 14px' }} />
                <EyeButton shown={showPw} onClick={() => setShowPw(v => !v)} />
              </div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Confirm new password</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, padding: '13px 48px 13px 14px' }} />
                <EyeButton shown={showPw} onClick={() => setShowPw(v => !v)} />
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 16 }}>Min 8 chars with uppercase, lowercase, number and symbol.</p>
              <button onClick={resetPassword} disabled={loading} style={{ width: '100%', padding: 14, background: loading ? '#A8294F' : '#7D1D3F', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}>{loading ? 'Resetting…' : 'Reset password'}</button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button type="button" onClick={sendOtp} disabled={loading} style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Didn&apos;t get a code? Resend</button>
              </div>
            </>
          )}

          {!done && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a href="/mobile/login" style={{ color: '#7A6870', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Back to sign in</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
