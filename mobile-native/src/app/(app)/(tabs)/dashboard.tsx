import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDashboard, useJobs } from '@/lib/hooks';
import { useAuth } from '@/lib/AuthContext';
import { useFormDownloadStatus } from '@/lib/useFormDownloads';
import JobCard from '@/components/JobCard';

const STAT_CARDS: { key: 'assigned' | 'inProgress' | 'needsReassignment' | 'completed'; label: string; color: string }[] = [
  { key: 'assigned', label: 'Assigned', color: '#92400E' },
  { key: 'inProgress', label: 'In Progress', color: '#1E40AF' },
  { key: 'needsReassignment', label: 'Need Reassign', color: '#9A3412' },
  { key: 'completed', label: 'Completed', color: '#065F46' },
];

export default function DashboardScreen() {
  const { engineerName, signOut } = useAuth();
  const { data, isLoading, error } = useDashboard();
  const { data: activeJobs } = useJobs('active');
  const downloadStatus = useFormDownloadStatus(activeJobs?.workOrders);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setRefreshing(false);
  }, [queryClient]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7D1D3F" />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hi, {engineerName || data?.engineer?.name || 'Engineer'}</Text>
          <Text style={styles.subGreeting}>Here&apos;s your day at a glance</Text>
        </View>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {(error || data?.error) && <Text style={styles.error}>{data?.error || 'Failed to load dashboard'}</Text>}

      <View style={styles.statsGrid}>
        {STAT_CARDS.map(card => (
          <View key={card.key} style={styles.statCard}>
            <Text style={[styles.statValue, { color: card.color }]}>{data?.stats[card.key] ?? 0}</Text>
            <Text style={styles.statLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      {downloadStatus.total > 0 && (
        <View style={styles.downloadCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.downloadTitle}>
              {downloadStatus.ready < downloadStatus.total ? 'Downloading forms for offline use…' : 'Forms ready offline'}
            </Text>
            <Text style={styles.downloadSub}>{downloadStatus.ready} of {downloadStatus.total} jobs ready</Text>
          </View>
          {downloadStatus.ready < downloadStatus.total && <ActivityIndicator size="small" color="#7D1D3F" />}
        </View>
      )}

      <Text style={styles.sectionTitle}>Recent jobs</Text>
      {data?.recentJobs.length ? (
        data.recentJobs.map(wo => <JobCard key={wo.id} wo={wo} />)
      ) : (
        <Text style={styles.empty}>No recent jobs</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greeting: { fontSize: 18, fontWeight: '700', color: '#1C0D14' },
  subGreeting: { fontSize: 12, color: '#7A6870', marginTop: 2 },
  signOut: { fontSize: 12, color: '#7D1D3F', fontWeight: '600' },
  error: { color: '#DC2626', fontSize: 12, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flexBasis: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#7D1D3F', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#7A6870', marginTop: 2 },
  downloadCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9EEF2', borderRadius: 12,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E8C5D0',
  },
  downloadTitle: { fontSize: 12, fontWeight: '600', color: '#7D1D3F' },
  downloadSub: { fontSize: 11, color: '#7A6870', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
});
