'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/app/actions/login'
import { appVersionLabel } from '@/lib/appVersion'
import { requestPasswordReset, confirmPasswordReset } from '@/app/actions/forgot-password'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(email, password)
    if (result.status === 'error') {
      setError(result.error)
      setLoading(false)
      return
    }
    if (result.status === 'challenge') {
      router.push('/set-password')
      return
    }
    // Full page navigation so proxy.ts reads the freshly-set session cookie.
    window.location.href = '/dashboard'
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await requestPasswordReset(forgotEmail)
    setLoading(false)
    setResetSent(true)
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await confirmPasswordReset(forgotEmail, resetCode, resetPassword)
    setLoading(false)
    if (error) { setError(error); return }
    setShowForgot(false)
    setResetSent(false)
    setNotice('Password reset. Sign in with your new password below.')
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--mdk) 0%, var(--m) 55%, #9B2D52 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative circles */}
      <div style={{ position:'absolute', top:'-25%', right:'-15%', width:500, height:500, borderRadius:'50%', background:'rgba(255,255,255,.04)' }}/>
      <div style={{ position:'absolute', bottom:'-20%', left:'-10%', width:380, height:380, borderRadius:'50%', background:'rgba(255,255,255,.03)' }}/>

      <div style={{ position:'relative', margin:'auto', width:420, minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', padding:'40px 0' }}>
        {/* Brand */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ background:'#fff', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', padding:'12px 18px', boxShadow:'0 8px 24px rgba(0,0,0,.15)' }}>
            <img src="/emr-logo.png" alt="EMR" style={{ height:30, width:'auto', display:'block' }} />
          </div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'#fff', letterSpacing:'-.3px', margin:0 }}>Global</h1>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:3, fontWeight:300 }}>Field Service Management Portal</p>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(255,255,255,.97)', borderRadius:16, padding:32, boxShadow:'0 24px 60px rgba(0,0,0,.3)' }}>
          {!showForgot ? (
            <>
              <h2 style={{ fontSize:16, fontWeight:600, color:'var(--tx)', margin:0, marginBottom:2 }}>Admin Sign In</h2>
              <div style={{ fontSize:11, color:'var(--txm)', marginBottom:20 }}>Authorised personnel only. Enter your credentials to continue.</div>
              {notice && (
                <div style={{ background:'#D1FAE5', color:'#065F46', borderRadius:8, padding:'10px 12px', fontSize:12, marginBottom:14 }}>{notice}</div>
              )}
              {error && (
                <div style={{ background:'#FEE2E2', color:'var(--red)', borderRadius:8, padding:'10px 12px', fontSize:12, marginBottom:14 }}>{error}</div>
              )}
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:500, color:'#374151', marginBottom:5 }}>Email address</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="admin@emrglobal.com"
                    style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--gm)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif' }}
                    onFocus={e => e.target.style.borderColor = 'var(--m)'}
                    onBlur={e => e.target.style.borderColor = 'var(--gm)'}
                  />
                </div>
                <div style={{ marginBottom:4 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:500, color:'#374151', marginBottom:5 }}>Password</label>
                  <div style={{ position:'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      style={{ width:'100%', padding:'10px 42px 10px 12px', boxSizing:'border-box', border:'1.5px solid var(--gm)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif' }}
                      onFocus={e => e.target.style.borderColor = 'var(--m)'}
                      onBlur={e => e.target.style.borderColor = 'var(--gm)'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position:'absolute', top:0, right:0, height:'100%', width:40, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', cursor:'pointer', color:'var(--txm)', padding:0 }}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => setShowForgot(true)} style={{ display:'block', textAlign:'right', width:'100%', fontSize:11, color:'var(--m)', background:'none', border:'none', cursor:'pointer', marginBottom:14, padding:'4px 0' }}>
                  Forgot password?
                </button>
                <button type="submit" disabled={loading} style={{ width:'100%', padding:11, background:'var(--m)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
                  {loading ? 'Signing in…' : 'Sign in to portal'}
                </button>
              </form>
              <div style={{ textAlign:'center', marginTop:12, fontSize:11, color:'var(--txm)' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--gl)', border:'1px solid var(--gm)', borderRadius:20, padding:'3px 10px' }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  Access by invitation only
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize:16, fontWeight:600, color:'var(--tx)', margin:0, marginBottom:2 }}>Reset password</h2>
              <div style={{ fontSize:11, color:'var(--txm)', marginBottom:20 }}>
                {resetSent ? 'Enter the code we emailed you along with a new password.' : 'Enter your registered email. A reset code will be sent.'}
              </div>
              {error && (
                <div style={{ background:'#FEE2E2', color:'var(--red)', borderRadius:8, padding:'10px 12px', fontSize:12, marginBottom:14 }}>{error}</div>
              )}
              {!resetSent ? (
                <form onSubmit={handleForgotPassword}>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:500, color:'#374151', marginBottom:5 }}>Email address</label>
                    <input
                      type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                      placeholder="admin@emrglobal.com"
                      style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--gm)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif' }}
                    />
                  </div>
                  <button type="submit" disabled={loading} style={{ width:'100%', padding:11, background:'var(--m)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>
                    Send reset code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset}>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:500, color:'#374151', marginBottom:5 }}>Reset code</label>
                    <input
                      type="text" value={resetCode} onChange={e => setResetCode(e.target.value)} required
                      placeholder="6-digit code"
                      style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--gm)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif' }}
                    />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={{ display:'block', fontSize:11, fontWeight:500, color:'#374151', marginBottom:5 }}>New password</label>
                    <input
                      type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required
                      placeholder="Min. 8 characters"
                      style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--gm)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif' }}
                    />
                  </div>
                  <button type="submit" disabled={loading} style={{ width:'100%', padding:11, background:'var(--m)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>
                    Set new password
                  </button>
                </form>
              )}
              <div style={{ textAlign:'center', marginTop:12 }}>
                <button onClick={() => { setShowForgot(false); setResetSent(false); setError('') }} style={{ fontSize:11, color:'var(--m)', background:'none', border:'none', cursor:'pointer' }}>← Back to sign in</button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign:'center', marginTop:'auto', paddingTop:24, fontSize:11, color:'rgba(255,255,255,.45)' }}>
          Powered by <a href="https://www.ittrident.com" target="_blank" rel="noopener noreferrer" style={{ color:'rgba(255,255,255,.75)', textDecoration:'none', fontWeight:500 }}>itTrident</a>
        </div>
        <div style={{ textAlign:'center', paddingTop:6, fontSize:10, color:'rgba(255,255,255,.4)' }}>
          {appVersionLabel()}
        </div>
      </div>
    </div>
  )
}
