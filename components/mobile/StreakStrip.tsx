'use client'

import type { EngineerStreak } from '@/lib/mobile/core/dashboard'

// PWA counterpart of the native app's StreakStrip: a thin strip tracking consecutive
// clean days (a day with at least one job closed and no reassignment). Days with no
// closures are empty dots, not a broken streak. Hidden entirely when there's nothing
// to show.
export default function StreakStrip({ streak }: { streak: EngineerStreak }) {
  if (streak.count === 0 && streak.days.every(d => !d)) return null

  return (
    <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 13, padding: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 20 }}>🔥</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1C0D14' }}>
          <span style={{ color: '#D97706', fontWeight: 800 }}>{streak.count}-day</span> on-time streak
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
          {streak.days.map((on, i) => {
            const isToday = i === streak.days.length - 1
            return (
              <span key={i} style={{
                width: 16, height: 16, borderRadius: 5,
                background: on ? '#D97706' : '#E8C5D0',
                border: isToday ? '1.5px solid #D97706' : 'none',
                boxSizing: 'border-box',
              }} />
            )
          })}
        </div>
      </div>
    </div>
  )
}
