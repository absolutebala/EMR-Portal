import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDashboard, useAlerts } from '@/lib/hooks';
import { useAuth } from '@/lib/AuthContext';
import JobCard from '@/components/JobCard';
import AccountMenu from '@/components/AccountMenu';
import StreakStrip from '@/components/StreakStrip';
import NearbyEngineersStrip from '@/components/NearbyEngineersStrip';
import PendingProductsCard from '@/components/PendingProductsCard';
import type { AttendanceEffectiveStatus } from '@/lib/types';

const STAT_CARDS: { key: 'assigned' | 'inProgress' | 'needsReassignment' | 'completed'; label: string; color: string }[] = [
  { key: 'assigned', label: 'Assigned', color: '#92400E' },
  { key: 'inProgress', label: 'In Progress', color: '#1E40AF' },
  { key: 'needsReassignment', label: 'Need Reassign', color: '#9A3412' },
  { key: 'completed', label: 'Completed', color: '#065F46' },
];

// Mirrors the PWA dashboard's attendanceCardStyle() — orange while the 11am window is
// still open, red once closed (or a late amendment is pending/rejected), green once
// present is confirmed. Holiday/Weekly Off get a neutral color.
function attendanceCardStyle(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string; sub: string | null } {
  switch (status.kind) {
    case 'pending':
      return { bg: '#FEF3C7', color: '#92400E', label: 'Mark attendance', sub: 'Before 11:00 AM' };
    case 'leave':
      return {
        bg: '#FEE2E2', color: '#991B1B', label: 'Leave',
        sub: status.pendingApproval ? 'Amendment pending approval' : status.rejected ? 'Amendment rejected' : 'Attendance not marked today',
      };
    case 'present':
      return { bg: '#D1FAE5', color: '#065F46', label: status.amended ? 'Present (amended)' : 'Present', sub: null };
    case 'holiday':
      return { bg: '#F1F5F9', color: '#475569', label: 'Holiday', sub: status.name };
    case 'weekly_off':
      return { bg: '#F1F5F9', color: '#475569', label: 'Weekly Off', sub: null };
    case 'not_applicable':
      return { bg: '#F1F5F9', color: '#475569', label: '—', sub: null };
  }
}

export default function DashboardScreen() {
  const router = useRouter();
  const { engineerName } = useAuth();
  const { data, isLoading, error } = useDashboard();
  const { data: alertsData } = useAlerts();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const unreadAlerts = alertsData?.unreadCount ?? 0;

  // The dashboard query's own 30s staleTime otherwise only refetches on remount or
  // app foreground — an admin reassigning a job, or a product request being approved
  // elsewhere, wouldn't show up here until then. Refetching on every tab focus (skip
  // the first — the query already fetches on mount) keeps "Assigned"/"In Progress"/
  // product-request counts current whenever the engineer switches back to this tab.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) { hasFocusedOnce.current = true; return; }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }, [queryClient])
  );

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

      {data?.attendanceStatus && (() => {
        const cfg = attendanceCardStyle(data.attendanceStatus);
        const clickable = data.attendanceStatus.kind === 'pending' || data.attendanceStatus.kind === 'leave';
        return (
          <Pressable
            style={[styles.attendanceCard, { backgroundColor: cfg.bg }]}
            onPress={() => clickable && router.push('/(app)/(tabs)/attendance')}
          >
            <View>
              <Text style={[styles.attendanceEyebrow, { color: cfg.color }]}>ATTENDANCE</Text>
              <Text style={[styles.attendanceLabel, { color: cfg.color }]}>{cfg.label}</Text>
              {cfg.sub && <Text style={[styles.attendanceSub, { color: cfg.color }]}>{cfg.sub}</Text>}
            </View>
            {clickable && <Text style={[styles.attendanceChevron, { color: cfg.color }]}>›</Text>}
          </Pressable>
        );
      })()}

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
  attendanceCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  attendanceEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, opacity: 0.75, marginBottom: 2 },
  attendanceLabel: { fontSize: 15, fontWeight: '700' },
  attendanceSub: { fontSize: 11, opacity: 0.85, marginTop: 1 },
  attendanceChevron: { fontSize: 22, fontWeight: '700' },
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
