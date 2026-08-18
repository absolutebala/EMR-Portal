import { View, Text, StyleSheet } from 'react-native';
import type { EngineerStreak } from '@/lib/types';

interface Props {
  streak: EngineerStreak;
}

// Mirrors the "Option A — Streak strip" mockup: a thin always-visible strip tracking
// consecutive clean days (see getEngineerStreakCore's doc comment on the backend for
// exactly what "clean" means — closed at least one job with no reassignment). Days with
// no closures at all are simply empty dots, not a broken streak.
export default function StreakStrip({ streak }: Props) {
  if (streak.count === 0 && streak.days.every(d => !d)) return null;

  return (
    <View style={styles.strip}>
      <Text style={styles.flame}>🔥</Text>
      <View style={styles.body}>
        <Text style={styles.title}>
          <Text style={styles.count}>{streak.count}-day</Text> on-time streak
        </Text>
        <View style={styles.dots}>
          {streak.days.map((on, i) => {
            const isToday = i === streak.days.length - 1;
            return <View key={i} style={[styles.dot, on && styles.dotOn, isToday && styles.dotToday]} />;
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: '#F9EEF2', borderWidth: 1, borderColor: '#E8C5D0', borderRadius: 13,
    padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  flame: { fontSize: 20 },
  body: { flex: 1 },
  title: { fontSize: 12.5, fontWeight: '600', color: '#1C0D14' },
  count: { color: '#D97706', fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5, marginTop: 6 },
  dot: { width: 16, height: 16, borderRadius: 5, backgroundColor: '#E8C5D0' },
  dotOn: { backgroundColor: '#D97706' },
  dotToday: { borderWidth: 1.5, borderColor: '#D97706' },
});
