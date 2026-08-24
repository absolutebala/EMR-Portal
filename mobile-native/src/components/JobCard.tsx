import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { MobileWorkOrder } from '@/lib/types';
import { JOB_TYPE_LABELS, STATUS_CONFIG, BAR_COLOR } from '@/lib/constants';

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function JobCard({ wo }: { wo: MobileWorkOrder }) {
  const router = useRouter();
  const st = STATUS_CONFIG[wo.status] || STATUS_CONFIG.assigned;

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/(app)/(tabs)/work-orders/${wo.id}`)}>
      <View style={[styles.bar, { backgroundColor: BAR_COLOR[wo.status] || '#94A3B8' }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{wo.customer_name}</Text>
            <Text style={styles.subLine}>
              {wo.wo_number} · {JOB_TYPE_LABELS[wo.job_type] || wo.job_type}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        <View style={styles.tagsRow}>
          {!!wo.site_name && <Text style={styles.tagMuted}>📍 {wo.site_name}</Text>}
          {wo.distanceKm != null && (
            <View style={styles.distancePill}>
              <Text style={styles.distanceText}>~{wo.distanceKm < 1 ? '<1' : wo.distanceKm.toFixed(1)} km away</Text>
            </View>
          )}
          {wo.serial_numbers.map(sn => (
            <View key={sn} style={styles.snPill}>
              <Text style={styles.snText}>{sn}</Text>
            </View>
          ))}
          {!!wo.scheduled_date && <Text style={styles.tagMuted}>{formatDate(wo.scheduled_date)}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    marginBottom: 9, shadowColor: '#7D1D3F', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bar: { width: 4 },
  body: { flex: 1, padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  customerName: { fontSize: 13, fontWeight: '600', color: '#1C0D14' },
  subLine: { fontSize: 11, color: '#7A6870', marginTop: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginLeft: 8 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagMuted: { fontSize: 10, color: '#7A6870' },
  distancePill: { backgroundColor: '#F9EEF2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  distanceText: { fontSize: 10, color: '#7D1D3F', fontWeight: '500' },
  snPill: { backgroundColor: '#F5F3F5', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  snText: { fontSize: 10, color: '#7A6870', fontWeight: '500' },
});
