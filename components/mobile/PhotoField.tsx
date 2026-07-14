'use client'

import { useRef, useState } from 'react'
import { compressImage } from '@/lib/mobile/compressImage'

interface Props {
  value: string
  onChange: (dataUrl: string) => void
  readOnly?: boolean
}

export default function PhotoField({ value, onChange, readOnly }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setCompressing(true)
    try {
      const dataUrl = await compressImage(file)
      onChange(dataUrl)
    } catch {
      setError('Could not process that photo — please try again')
    } finally {
      setCompressing(false)
    }
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleChange} style={{ display: 'none' }} disabled={readOnly} />

      {compressing ? (
        <div style={{ border: '1.5px dashed #E8C5D0', borderRadius: 11, padding: 18, textAlign: 'center', background: '#F9EEF2' }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F', margin: 0 }}>Processing photo…</p>
        </div>
      ) : !value ? (
        <div
          className="mtap"
          onClick={() => !readOnly && fileInputRef.current?.click()}
          style={{ border: '1.5px dashed #E8C5D0', borderRadius: 11, padding: 18, textAlign: 'center', cursor: readOnly ? 'default' : 'pointer', background: '#F9EEF2' }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7D1D3F" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 6px', opacity: 0.6 }}>
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
          </svg>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F', margin: 0 }}>Tap to capture photo</p>
        </div>
      ) : (
        <div
          className="mtap"
          onClick={() => !readOnly && fileInputRef.current?.click()}
          style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: readOnly ? 'default' : 'pointer' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Captured" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 7, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#065F46' }}>Photo captured</div>
            {!readOnly && <div style={{ fontSize: 10, color: '#059669' }}>Tap to retake</div>}
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 6 }}>{error}</div>}
    </div>
  )
}
