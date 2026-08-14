'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { completeNewPassword } from '@/app/actions/complete-new-password'

// The one page every temp-password user (freshly invited, or admin-reset) lands on
// after login()'s NEW_PASSWORD_REQUIRED challenge — replaces the old three-mechanism
// version of this page (Supabase token_hash activation links, legacy hash-fragment
// magic links, and an already-authenticated fallback) and the separate desktop/mobile
// change-password pages' "already signed in, just update the password" flow. Cognito
// never issues real tokens for a temp-password account until this challenge is
// answered, so there's no "already authenticated" state to detect here anymore — if a
// visitor lands here without having just gone through login()'s challenge, the
// completeNewPassword() call below fails cleanly with "session expired."
export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError('')
    const { error } = await completeNewPassword(password)
    if (error) { setError(error); setLoading(false); return }
    // Full page navigation so proxy.ts reads the freshly-set session cookie.
    window.location.href = '/dashboard'
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--mdk) 0%, var(--m) 55%, #9B2D52 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: '-25%', right: '-15%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }}/>
      <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: 380, height: 380, borderRadius: '50%', background: 'rgba(255,255,255,.03)' }}/>

      <div style={{ position: 'relative', margin: 'auto', width: 420, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', padding: '40px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 54, height: 54, background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="26" height="26" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-.5px', margin: 0 }}>EMR Global</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 3, fontWeight: 300 }}>Field Service Management Portal</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,.97)', borderRadius: 16, padding: 32, boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)', margin: '0 0 4px' }}>Set your password</h2>
          <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 6 }}>
            Welcome! Please set a permanent password to continue.
          </div>
          <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 20 }}>
            Already set your password?{' '}
            <a href="/login" style={{ color: 'var(--m)', fontWeight: 600, textDecoration: 'underline' }}>Sign in</a>
          </div>
          {error && (
            <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5 }}>New password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="Min. 8 characters"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Confirm password</label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                placeholder="Re-enter your password"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}
              />
            </div>
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: 11, background: 'var(--m)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
              {loading ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
