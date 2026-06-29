'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (!error) setResetSent(true)
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
          <div style={{ width:54, height:54, background:'rgba(255,255,255,.15)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,.2)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <svg width="26" height="26" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>
          </div>
          <h1 style={{ fontSize:26, fontWeight:700, color:'#fff', letterSpacing:'-.5px', margin:0 }}>EMR Global</h1>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:3, fontWeight:300 }}>Field Service Management Portal</p>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(255,255,255,.97)', borderRadius:16, padding:32, boxShadow:'0 24px 60px rgba(0,0,0,.3)' }}>
          {!showForgot ? (
            <>
              <h2 style={{ fontSize:16, fontWeight:600, color:'var(--tx)', margin:0, marginBottom:2 }}>Admin Sign In</h2>
              <div style={{ fontSize:11, color:'var(--txm)', marginBottom:20 }}>Authorised personnel only. Enter your credentials to continue.</div>
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
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="••••••••"
                    style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--gm)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif' }}
                    onFocus={e => e.target.style.borderColor = 'var(--m)'}
                    onBlur={e => e.target.style.borderColor = 'var(--gm)'}
                  />
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
              <div style={{ fontSize:11, color:'var(--txm)', marginBottom:20 }}>Enter your registered email. A reset link will be sent.</div>
              {resetSent ? (
                <div style={{ background:'#D1FAE5', color:'#065F46', borderRadius:8, padding:'12px 14px', fontSize:12 }}>
                  Reset link sent! Check your email inbox.
                </div>
              ) : (
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
                    Send reset link
                  </button>
                </form>
              )}
              <div style={{ textAlign:'center', marginTop:12 }}>
                <button onClick={() => { setShowForgot(false); setResetSent(false) }} style={{ fontSize:11, color:'var(--m)', background:'none', border:'none', cursor:'pointer' }}>← Back to sign in</button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign:'center', marginTop:'auto', paddingTop:24, fontSize:11, color:'rgba(255,255,255,.45)' }}>
          Powered by <a href="#" style={{ color:'rgba(255,255,255,.75)', textDecoration:'none', fontWeight:500 }}>Absolute App Labs</a>
        </div>
      </div>
    </div>
  )
}
