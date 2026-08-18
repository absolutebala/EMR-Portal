import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDashboard, useAlerts } from '@/lib/hooks';
import { useAuth } from '@/lib/AuthContext';
import JobCard from '@/components/JobCard';
import AccountMenu from '@/components/AccountMenu';
import StreakStrip from '@/components/StreakStrip';
import NearbyEngineersStrip from '@/components/NearbyEngineersStrip';
import PendingProductsCard from '@/components/PendingProductsCard';

const STAT_CARDS: { key: 'assigned' | 'inProgress' | 'needsReassignment' | 'completed'; label: string; color: string }[] = [
  { key: 'assigned', label: 'Assigned', color: '#92400E' },
  { key: 'inProgress', label: 'In Progress', color: '#1E40AF' },
  { key: 'needsReassignment', label: 'Need Reassign', color: '#9A3412' },
  { key: 'completed', label: 'Completed', color: '#065F46' },
];

export default function DashboardScreen() {
  const router = useRouter();
  const { engineerName } = useAuth();
  const { data, isLoading, error } = useDashboard();
  const { data: alertsData } = useAlerts();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const unreadAlerts = alertsData?.unreadCount ?? 0;

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
        <View style={styles.headerActions}>
          <Pressable style={styles.bellButton} onPress={() => router.push('/(app)/alerts')}>
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadAlerts > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadAlerts > 9 ? '9+' : unreadAlerts}</Text>
              </View>
            )}
          </Pressable>
          <AccountMenu avatarUrl={data?.engineer?.avatarUrl ?? null} name={engineerName || data?.engineer?.name || null} />
        </View>
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

      {data?.streak && <StreakStrip streak={data.streak} />}

      {data?.pendingProducts && <PendingProductsCard items={data.pendingProducts} />}

      <Text style={styles.sectionTitle}>Recent jobs</Text>
      {data?.recentJobs.length ? (
        data.recentJobs.map(wo => <JobCard key={wo.id} wo={wo} />)
      ) : (
        <Text style={styles.empty}>No recent jobs</Text>
      )}

      <NearbyEngineersStrip />
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bellButton: { position: 'relative', padding: 2 },
  bellIcon: { fontSize: 20 },
  badge: {
    position: 'absolute', top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  error: { color: '#DC2626', fontSize: 12, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flexBasis: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#7D1D3F', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#7A6870', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
});
