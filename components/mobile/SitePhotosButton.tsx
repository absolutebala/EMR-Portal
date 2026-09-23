'use client'

import { useState, useRef, useCallback } from 'react'
import { getSitePhotos, addSitePhotos } from '@/app/actions/site-photos'
import { compressImage } from '@/lib/mobile/compressImage'
import type { SitePhoto } from '@/lib/mobile/core/sitePhotos'

// "Site Photos" for a notification on the PWA mobile app — a button (shown top-right on
// the job screen) that opens a gallery of previously-added photos and lets the engineer
// add more (multiple at once, any number of times). Photos are stored server-side (S3)
// and visible on both mobile and the desktop notification detail.
export default function SitePhotosButton({ workOrderId }: { workOrderId: string }) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<SitePhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const r = await getSitePhotos(workOrderId)
    setPhotos(r.photos); setLoading(false)
  }, [workOrderId])

  function openModal() { setOpen(true); load() }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length) return
    setUploading(true); setError('')
    try {
      const payload = []
      for (const f of files) {
        const dataUrl = await compressImage(f)
        payload.push({ base64: dataUrl, mimeType: 'image/jpeg', ext: 'jpg' })
      }
      const r = await addSitePhotos(workOrderId, payload)
      if (r.error) { setError(r.error); setUploading(false); return }
      await load()
    } catch {
      setError('Could not upload one or more photos. Please try again.')
    }
    setUploading(false)
  }

  return (
    <>
      <button
        onClick={openModal}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #E5E0E3', background: '#fff', color: '#7D1D3F', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
        Site Photos
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ background: '#fff', borderRadius: '18px 18px 0 0', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #F1E7EB' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1C0D14' }}>Site Photos</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#7A6870', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto' }}>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handleFiles} style={{ display: 'none' }} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ width: '100%', padding: 13, borderRadius: 12, border: '1.5px dashed #7D1D3F', background: '#F9EEF2', color: '#7D1D3F', fontSize: 14, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', fontFamily: 'Poppins, sans-serif', marginBottom: 14 }}
              >
                {uploading ? 'Uploading…' : '+ Add photos'}
              </button>

              {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}

              {loading ? (
                <div style={{ textAlign: 'center', color: '#7A6870', fontSize: 13, padding: 20 }}>Loading…</div>
              ) : photos.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>No site photos yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {photos.map(p => (
                    <button key={p.id} onClick={() => setLightbox(p.url)} style={{ padding: 0, border: '1px solid #E5E0E3', borderRadius: 10, overflow: 'hidden', aspectRatio: '1 / 1', background: '#F8F5F6', cursor: 'pointer' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </>
  )
}
