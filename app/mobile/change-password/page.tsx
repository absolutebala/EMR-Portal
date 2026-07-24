'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { completePasswordChange } from '@/app/actions/complete-password-change'

export default function MobileChangePasswordPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/mobile/login'); return }
      setEmail(user.email || '')
      setReady(true)
    })
  }, [supabase, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setSaving(true)
    setError('')

    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) { setError(pwError.message); setSaving(false); return }

    const { error: profileError } = await completePasswordChange()
    if (profileError) { setError('Password set but could not update profile. Please contact admin.'); setSaving(false); return }

    // Same staleness issue as desktop's change-password page: the cached session JWT's
    // must_change_password claim doesn't update until the token is refreshed.
    await supabase.auth.refreshSession()

    window.location.href = '/mobile/dashboard'
  }

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
          {!ready ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#7A6870', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1C0D14', margin: '0 0 4px' }}>Set your password</h2>
              <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 24 }}>
                Welcome! Please set a permanent password for <strong>{email}</strong>
              </p>

              {error && (
                <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                    New password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Min. 8 characters"
                    style={{
                      width: '100%', padding: '13px 14px',
                      border: '1.5px solid #E5E0E3', borderRadius: 10,
                      fontSize: 15, outline: 'none',
                      fontFamily: 'Poppins, sans-serif',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                    Confirm password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter your password"
                    style={{
                      width: '100%', padding: '13px 14px',
                      border: '1.5px solid #E5E0E3', borderRadius: 10,
                      fontSize: 15, outline: 'none',
                      fontFamily: 'Poppins, sans-serif',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    width: '100%', padding: '14px',
                    background: saving ? '#A8294F' : '#7D1D3F',
                    color: '#fff', border: 'none', borderRadius: 12,
                    fontSize: 15, fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontFamily: 'Poppins, sans-serif',
                    transition: 'background 0.2s',
                  }}
                >
                  {saving ? 'Saving…' : 'Set password & continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 24, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
        EMR Global · Field Service Management
      </div>
    </div>
  )
}
