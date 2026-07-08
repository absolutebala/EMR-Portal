'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { updateMyProfile, changeMyPassword } from '@/app/actions/update-my-profile'

const fi: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', boxSizing: 'border-box', transition: 'border .15s' }
const fiRO: React.CSSProperties = { ...fi, background: 'var(--gl)', color: 'var(--txm)' }
const fl: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

interface ProfileData { first_name: string; last_name: string; phone: string; email: string; employee_id: string }

const empty: ProfileData = { first_name: '', last_name: '', phone: '', email: '', employee_id: '' }

export default function EditProfileModal({ open, onClose, userEmail }: { open: boolean; onClose: () => void; userEmail: string }) {
  const [tab, setTab] = useState<'profile' | 'password'>('profile')
  const [profile, setProfile] = useState<ProfileData>({ ...empty, email: userEmail })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdSaved, setPwdSaved] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false })

  useEffect(() => {
    if (!open) return
    setTab('profile')
    setProfileSaved(false)
    setProfileError('')
    setPwd({ current: '', next: '', confirm: '' })
    setPwdSaved(false)
    setPwdError('')
    setShowPwd({ current: false, next: false, confirm: false })

    setLoading(true)
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      sb.from('profiles')
        .select('first_name, last_name, phone, employee_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setProfile({
            first_name: data?.first_name || '',
            last_name: data?.last_name || '',
            phone: data?.phone || '',
            email: user.email || userEmail,
            employee_id: data?.employee_id || '',
          })
          setLoading(false)
        })
    })
  }, [open, userEmail])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setProfileError('')
    const { error } = await updateMyProfile({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone || null })
    setSaving(false)
    if (error) { setProfileError(error); return }
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwd.next !== pwd.confirm) { setPwdError('New passwords do not match.'); return }
    if (pwd.next.length < 8) { setPwdError('New password must be at least 8 characters.'); return }
    setPwdSaving(true)
    setPwdError('')
    const { error } = await changeMyPassword(pwd.current, pwd.next)
    setPwdSaving(false)
    if (error) { setPwdError(error); return }
    setPwdSaved(true)
    setPwd({ current: '', next: '', confirm: '' })
    setTimeout(() => setPwdSaved(false), 2500)
  }

  const tabBtn = (t: 'profile' | 'password', label: string) => (
    <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--m)' : 'var(--txm)', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--m)' : 'transparent'}`, cursor: 'pointer', fontFamily: 'Poppins,sans-serif', transition: 'all .15s' }}>
      {label}
    </button>
  )

  const eyeIcon = (show: boolean) => (
    <svg width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24">
      {show
        ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      }
    </svg>
  )

  return (
    <Modal open={open} onClose={onClose} title="Edit Profile" size="sm"
      footer={<button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Close</button>}
    >
      <div style={{ display: 'flex', borderBottom: '1px solid var(--gm)', marginBottom: 20 }}>
        {tabBtn('profile', 'Profile Info')}
        {tabBtn('password', 'Change Password')}
      </div>

      {tab === 'profile' ? (
        loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: 'var(--txm)' }}>Loading…</div>
        ) : (
        <form onSubmit={handleSaveProfile}>
          {profileError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{profileError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={fl}>First name <span style={{ color: 'var(--m)' }}>*</span></label>
              <input required style={fi} value={profile.first_name} onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" />
            </div>
            <div>
              <label style={fl}>Last name <span style={{ color: 'var(--m)' }}>*</span></label>
              <input required style={fi} value={profile.last_name} onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" />
            </div>
            <div>
              <label style={fl}>Phone</label>
              <input style={fi} value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+91 XXXXXXXXXX" />
            </div>
            <div>
              <label style={fl}>Email</label>
              <input style={fiRO} value={profile.email} readOnly />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fl}>Employee ID</label>
              <input style={fiRO} value={profile.employee_id} readOnly />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            {profileSaved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
            <button type="submit" disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
        )
      ) : (
        <form onSubmit={handleChangePassword}>
          {pwdError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{pwdError}</div>}
          {([
            { key: 'current' as const, label: 'Current password' },
            { key: 'next' as const, label: 'New password' },
            { key: 'confirm' as const, label: 'Confirm new password' },
          ]).map(({ key, label }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={fl}>{label} <span style={{ color: 'var(--m)' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <input required type={showPwd[key] ? 'text' : 'password'} style={{ ...fi, paddingRight: 36 }} value={pwd[key]} onChange={e => setPwd(p => ({ ...p, [key]: e.target.value }))} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPwd(s => ({ ...s, [key]: !s[key] }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  {eyeIcon(showPwd[key])}
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            {pwdSaved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Password updated</span>}
            <button type="submit" disabled={pwdSaving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', cursor: pwdSaving ? 'not-allowed' : 'pointer', opacity: pwdSaving ? .7 : 1 }}>
              {pwdSaving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
