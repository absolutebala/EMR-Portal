'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearActivationToken } from '@/app/actions/clear-activation-token'
import { useRouter } from 'next/navigation'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tokenHash = searchParams.get('token_hash')
    const type = (searchParams.get('type') || 'recovery') as 'recovery' | 'invite' | 'email'

    if (tokenHash) {
      // Path A: from /activate — exchange hashed token directly (no Supabase redirect URL needed)
      supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        .then(({ data, error }) => {
          if (error) { setError('This link has expired or already been used. Please ask your admin for a new one.'); return }
          setEmail(data.user?.email || '')
          setUserId(data.user?.id || '')
          setReady(true)
        })
      return
    }

    // Path B: from legacy Supabase redirect (hash fragment with access_token)
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace('#', ''))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (error) { setError('Invalid or expired invite link.'); return }
          setEmail(data.user?.email || '')
          setUserId(data.user?.id || '')
          setReady(true)
        })
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) { setEmail(user.email || ''); setUserId(user.id || ''); setReady(true) }
        else setError('Invalid or expired invite link. Please ask your admin for a new one.')
      })
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    // Mark activation complete so the link can no longer be reused
    if (userId) await clearActivationToken(userId)
    router.push('/dashboard')
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
          {!ready && !error ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txm)', fontSize: 13 }}>
              Verifying your invite…
            </div>
          ) : error && !ready ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '12px 14px', fontSize: 12, marginBottom: 16 }}>{error}</div>
              <a href="/login" style={{ fontSize: 12, color: 'var(--m)', textDecoration: 'none', fontWeight: 500 }}>← Back to sign in</a>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)', margin: '0 0 4px' }}>Create your password</h2>
              <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 20 }}>
                Setting up account for <strong>{email}</strong>
              </div>
              {error && (
                <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>
              )}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5 }}>New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Min. 8 characters"
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter your password"
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}
                  />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: 11, background: 'var(--m)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
                  {loading ? 'Saving…' : 'Set password & sign in'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
