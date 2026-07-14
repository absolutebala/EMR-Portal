'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (dataUrl: string) => void
  readOnly?: boolean
}

export default function SignaturePad({ value, onChange, readOnly }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasInk, setHasInk] = useState(!!value)

  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    // Deferred a frame so the canvas's container has finished layout — sizing from
    // getBoundingClientRect() immediately on mount can read a 0-size box if the
    // surrounding form hasn't settled yet, making the pad silently unresponsive.
    const raf = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvasEl.getBoundingClientRect()
      canvasEl.width = rect.width * dpr
      canvasEl.height = rect.height * dpr
      const ctx = canvasEl.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1C0D14'

      if (value) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = value
      }
    })
    return () => {
      cancelAnimationFrame(raf)
      // Flush rather than drop — if the pad unmounts (navigating away) while a debounced
      // commit is pending, the last stroke would otherwise be silently lost.
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current)
        onChange(canvasEl.toDataURL('image/png'))
      }
    }
    // Canvas is (re)initialized once on mount to size correctly for the device pixel ratio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || readOnly) return
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
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    // Debounce committing to parent state — a signature is usually several strokes
    // (pen lifted between letters), and calling onChange after every single stroke
    // forces a full form re-render each time, which is what made the pad feel
    // laggy/unresponsive mid-signature on a form with many other fields.
    if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current)
    commitTimeoutRef.current = setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas) onChange(canvas.toDataURL('image/png'))
    }, 400)
  }

  function handleClear() {
    if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange('')
  }

  return (
    <div>
      <div style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        border: `1.5px ${hasInk ? 'solid' : 'dashed'} ${hasInk ? '#A7F3D0' : '#E8C5D0'}`,
        background: hasInk ? '#ECFDF5' : '#F9EEF2',
      }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: '100%', height: 140, display: 'block', touchAction: 'none' }}
        />
        {!hasInk && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <svg width="20" height="20" fill="none" stroke="#7D1D3F" strokeWidth="1.5" viewBox="0 0 24 24" style={{ opacity: 0.5, marginBottom: 6 }}>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
            </svg>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F' }}>Sign here with your finger</div>
          </div>
        )}
      </div>
      {hasInk && !readOnly && (
        <button
          type="button"
          className="mtap"
          onClick={handleClear}
          style={{
            marginTop: 6, background: 'none', border: 'none', color: '#7A6870',
            fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', padding: '4px 0',
          }}
        >
          Clear signature
        </button>
      )}
    </div>
  )
}
