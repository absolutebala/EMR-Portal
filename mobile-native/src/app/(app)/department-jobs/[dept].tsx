import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useDepartmentJobs } from '@/lib/hooks';
import { STATUS_CONFIG } from '@/lib/constants';

function formatDate(d: string | null): string {
  if (!d) return 'Not scheduled';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Read-only by design, same as the PWA equivalent: any authenticated engineer can
// already check into/close any work order server-side with no ownership check, so
// this cross-engineer list deliberately doesn't link into the actionable job detail
// screen — only shows who's assigned what.
export default function DepartmentJobsScreen() {
  const { dept, name } = useLocalSearchParams<{ dept: string; name?: string }>();
  const { data, isLoading, error } = useDepartmentJobs(dept);
  const jobs = data?.jobs ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: name || 'Department', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />

      {isLoading ? (
        <ActivityIndicator color="#7D1D3F" style={{ marginTop: 20 }} />
      ) : error || data?.error ? (
        <Text style={styles.error}>{data?.error || 'Failed to load jobs'}</Text>
      ) : (
        <>
          <Text style={styles.count}>{jobs.length} open notification{jobs.length === 1 ? '' : 's'}</Text>
          {jobs.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No open notifications for this department.</Text>
            </View>
          ) : (
            jobs.map(job => {
              const st = STATUS_CONFIG[job.status] || STATUS_CONFIG.assigned;
              return (
                <View key={job.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.woNumber}>{job.woNumber}</Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.detailLine}>{job.customerName}{job.siteName ? ` — ${job.siteName}` : ''}</Text>
                  {job.serialNumbers.length > 0 && (
                    <Text style={styles.detailSub}>Serial: {job.serialNumbers.join(', ')}</Text>
                  )}
                  <Text style={styles.detailSub}>Engineer: {job.engineerName}</Text>
                  <Text style={styles.detailSub}>Scheduled: {formatDate(job.scheduledDate)}</Text>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 32 },
  error: { color: '#DC2626', fontSize: 12, marginBottom: 12 },
  count: { fontSize: 11, color: '#7A6870', marginBottom: 12 },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E5E0E3' },
  emptyText: { fontSize: 12, color: '#7A6870' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 9 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  woNumber: { fontSize: 13, fontWeight: '700', color: '#1C0D14' },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  detailLine: { fontSize: 12, color: '#374151', marginBottom: 2 },
  detailSub: { fontSize: 11, color: '#7A6870', marginBottom: 2 },
});
