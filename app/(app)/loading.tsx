export default function Loading() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--gl)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32,
          height: 32,
          border: '3px solid var(--mb)',
          borderTop: '3px solid var(--m)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}/>
        <span style={{ fontSize: 12, color: 'var(--txm)' }}>Loading…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
