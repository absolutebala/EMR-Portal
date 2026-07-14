export default function MobileLoadingSkeleton({ withStatusBar = false }: { withStatusBar?: boolean }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <div style={{ background: '#3A0A1C', padding: '14px 16px', height: 50 }} />
      {withStatusBar && <div style={{ background: '#3A0A1C', height: 70, opacity: 0.85 }} />}
      <div style={{ flex: 1, padding: 16 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            background: '#fff', borderRadius: 13, height: 64, marginBottom: 10,
            opacity: 1 - i * 0.15, animation: 'mpulse 1.1s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
      </div>
      <style>{`@keyframes mpulse { 0%, 100% { opacity: .55 } 50% { opacity: .9 } }`}</style>
    </div>
  )
}
