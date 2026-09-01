'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { login } from '@/app/actions/login'
import { useRouter } from 'next/navigation'

export default function MobileLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(email, password, { requireRole: 'Field Engineer' })
    if (result.status === 'error') {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result.status === 'challenge') {
      router.push('/mobile/change-password')
      return
    }
    // Full page navigation so proxy.ts reads the freshly-set session cookie.
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
      {/* Top branding */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            background: '#fff',
            borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            padding: '16px 22px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          }}>
            <img src="/emr-logo.png" alt="EMR" style={{ height: 38, width: 'auto', display: 'block' }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Field</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: 300 }}>Field Engineer App</p>
        </div>

        {/* Login card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1C0D14', margin: '0 0 4px' }}>Sign in</h2>
          <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 24 }}>Use your EMR account credentials</p>

          {error && (
            <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@emrglobal.com"
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
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '13px 48px 13px 14px',
                    border: '1.5px solid #E5E0E3', borderRadius: 10,
                    fontSize: 15, outline: 'none',
                    fontFamily: 'Poppins, sans-serif',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#8A7C82', padding: 0 }}
                >
                  {showPassword ? (
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading ? '#A8294F' : '#7D1D3F',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'Poppins, sans-serif',
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 24, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
        EMR Global · Field Service Management
      </div>
      <div style={{ textAlign: 'center', paddingBottom: 20, fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
        Powered by <a href="https://www.ittrident.com" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,.75)', textDecoration: 'none', fontWeight: 500 }}>itTrident</a>
      </div>
    </div>
  )
}
