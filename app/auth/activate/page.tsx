'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validateActivationLink } from '@/app/actions/validate-activation-link'
import { clearActivationToken } from '@/app/actions/clear-activation-token'
import { useRouter } from 'next/navigation'

export default function ActivatePage() {
  const [state, setState] = useState<'loading' | 'form' | 'error' | 'done'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')

    if (!token) {
      setErrorMsg('Invalid activation link.')
      setState('error')
      return
    }

    validateActivationLink(token).then(async ({ access_token, refresh_token, email: userEmail, error }) => {
      if (error === 'already-active') {
        setErrorMsg('This account is already active. Please sign in.')
        setState('error')
        return
      }
      if (error || !access_token || !refresh_token) {
        setErrorMsg('Could not verify this link. Please ask your admin for a new one.')
        setState('error')
        return
      }

      // Server already exchanged the OTP — just hydrate the browser session from the tokens
      const { data, error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token })

      if (sessionError || !data.user) {
        setErrorMsg('This link has expired or already been used. Please ask your admin for a new one.')
        setState('error')
        return
      }

      setEmail(userEmail || data.user.email || '')
      setUserId(data.user.id)
      setState('form')
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setFormError('Passwords do not match.'); return }
    if (password.length < 8) { setFormError('Password must be at least 8 characters.'); return }
    setSaving(true)
    setFormError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setFormError(error.message); setSaving(false); return }
    if (userId) await clearActivationToken(userId)
    setState('done')
    router.push('/dashboard')
  }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--mdk) 0%, var(--m) 55%, #9B2D52 100%)',
      position: 'relative', overflow: 'hidden',
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
          {state === 'loading' && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txm)', fontSize: 13 }}>
              Verifying your invite…
            </div>
          )}

          {state === 'error' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '12px 14px', fontSize: 12, marginBottom: 16 }}>{errorMsg}</div>
              <a href="/login" style={{ fontSize: 12, color: 'var(--m)', textDecoration: 'none', fontWeight: 500 }}>← Back to sign in</a>
            </div>
          )}

          {state === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txm)', fontSize: 13 }}>
              Password set! Redirecting…
            </div>
          )}

          {state === 'form' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)', margin: '0 0 4px' }}>Create your password</h2>
              <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 20 }}>
                Setting up account for <strong>{email}</strong>
              </div>
              {formError && (
                <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{formError}</div>
              )}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5 }}>New password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 characters"
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}/>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Confirm password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Re-enter your password"
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }}/>
                </div>
                <button type="submit" disabled={saving}
                  style={{ width: '100%', padding: 11, background: 'var(--m)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
                  {saving ? 'Saving…' : 'Set password & sign in'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
