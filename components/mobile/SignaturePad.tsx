'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (dataUrl: string) => void
  readOnly?: boolean
}

export default function SignaturePad({ value, onChange, readOnly }: Props) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  // Preview is read-only — it just renders the saved signature (or a placeholder).
  // Drawing happens exclusively in the fullscreen editor opened on tap.
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const raf = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, rect.width, rect.height)
      if (value) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = value
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <div>
      <div
        onClick={() => { if (!readOnly) setFullscreenOpen(true) }}
        style={{
          position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: readOnly ? 'default' : 'pointer',
          border: `1.5px ${value ? 'solid' : 'dashed'} ${value ? '#A7F3D0' : '#E8C5D0'}`,
          background: value ? '#ECFDF5' : '#F9EEF2',
        }}
      >
        <canvas ref={previewCanvasRef} style={{ width: '100%', height: 140, display: 'block' }} />
        {!value && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <svg width="20" height="20" fill="none" stroke="#7D1D3F" strokeWidth="1.5" viewBox="0 0 24 24" style={{ opacity: 0.5, marginBottom: 6 }}>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
            </svg>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F' }}>{readOnly ? 'No signature' : 'Tap to sign'}</div>
          </div>
        )}
      </div>
      {value && !readOnly && (
        <button
          type="button"
          className="mtap"
          onClick={() => onChange('')}
          style={{
            marginTop: 6, background: 'none', border: 'none', color: '#7A6870',
            fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', padding: '4px 0',
          }}
        >
          Clear signature
        </button>
      )}
      {fullscreenOpen && (
        <FullscreenSignaturePad
          initialValue={value}
          onCancel={() => setFullscreenOpen(false)}
          onSave={dataUrl => { onChange(dataUrl); setFullscreenOpen(false) }}
        />
      )}
    </div>
  )
}

function FullscreenSignaturePad({ initialValue, onCancel, onSave }: {
  initialValue: string
  onCancel: () => void
  onSave: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(!!initialValue)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const raf = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1C0D14'
      if (initialValue) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = initialValue
      }
    })
    return () => cancelAnimationFrame(raf)
    // Sized once on mount for the rotated landscape surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !lastPointRef.current) return
    const point = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    if (!hasInk) setHasInk(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(hasInk ? canvas.toDataURL('image/png') : '')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1C0D14', zIndex: 100 }}>
      {/* Rotated 90deg to give a wide landscape surface while the phone stays upright. */}
      <div
        style={{
          position: 'fixed', top: '100%', left: 0, width: '100vh', height: '100vw',
          transformOrigin: '0 0', transform: 'rotate(-90deg)',
          display: 'flex', flexDirection: 'column', background: '#fff',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid #E5E0E3', flexShrink: 0,
        }}>
          <button
            type="button"
            className="mtap"
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: '#7A6870', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', padding: '8px 4px' }}
          >
            Cancel
          </button>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>Sign here</div>
          <button
            type="button"
            className="mtap"
            onClick={handleSave}
            style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', padding: '8px 4px' }}
          >
            Save
          </button>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          />
          {!hasInk && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#B7A8AF' }}>Sign with your finger</div>
            </div>
          )}
        </div>
        {hasInk && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid #E5E0E3', flexShrink: 0 }}>
            <button
              type="button"
              className="mtap"
              onClick={handleClear}
              style={{ background: 'none', border: 'none', color: '#7A6870', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', padding: '4px 0' }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
