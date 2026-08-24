'use client'

import { useRef, useState } from 'react'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { updateMyProfile, uploadMyAvatar } from '@/app/actions/update-my-profile'
import { compressImage } from '@/lib/mobile/compressImage'
import type { MyProfile } from '@/lib/mobile/core/profile'

interface Props {
  profile: MyProfile | null
  error: string | null
}

function initials(firstName: string, lastName: string): string {
  return ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?'
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 14, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }

export default function ProfileClient({ profile: initialProfile, error: loadError }: Props) {
  const [firstName, setFirstName] = useState(initialProfile?.firstName || '')
  const [lastName, setLastName] = useState(initialProfile?.lastName || '')
  const [phone, setPhone] = useState(initialProfile?.phone || '')
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatarUrl || null)
  const [email] = useState(initialProfile?.email || '')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploadingAvatar(true)
    try {
      const dataUrl = await compressImage(file)
      const { url, error: uploadError } = await uploadMyAvatar({ base64: dataUrl, mimeType: 'image/jpeg', ext: 'jpg' })
      if (uploadError) { setError(uploadError); return }
      setAvatarUrl(url)
    } catch {
      setError('Could not process that photo — please try again')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    const { error: saveError } = await updateMyProfile({ first_name: firstName, last_name: lastName, phone: phone || null })
    setSaving(false)
    if (saveError) { setError(saveError); return }
    setSaved(true)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Profile" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loadError && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>{loadError}</div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
          <div
            className="mtap"
            onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
            style={{
              width: 84, height: 84, borderRadius: '50%', margin: '0 auto', cursor: uploadingAvatar ? 'default' : 'pointer',
              background: '#F9EEF2', border: '1.5px solid #E8C5D0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            {uploadingAvatar ? (
              <span style={{ fontSize: 11, color: '#7D1D3F' }}>Uploading…</span>
            ) : avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 26, fontWeight: 700, color: '#7D1D3F' }}>{initials(firstName, lastName)}</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#7D1D3F', marginTop: 10 }}>Tap to change photo</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>First name</label>
          <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Last name</label>
          <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Phone number</label>
          <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Email</label>
          <div style={{ ...inputStyle, background: '#F5F3F5', color: '#7A6870' }}>{email}</div>
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 12.5, textAlign: 'center', marginBottom: 14 }}>{error}</div>}
        {saved && !error && <div style={{ color: '#059669', fontSize: 12.5, textAlign: 'center', marginBottom: 14 }}>Profile updated.</div>}

        <button
          className="mtap"
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: 15, borderRadius: 12, border: 'none',
            background: saving ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 15, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      <BottomNav />
    </div>
  )
}
