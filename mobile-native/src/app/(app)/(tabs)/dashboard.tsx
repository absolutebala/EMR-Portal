import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { useDashboard, useAlerts, useDepartmentCounts, useMarkEndDay, reverseGeocode } from '@/lib/hooks';
import { useAuth } from '@/lib/AuthContext';
import { getCurrentPositionWithFallback } from '@/lib/gps';
import { apiErrorMessage } from '@/lib/offlineSubmit';
import JobCard from '@/components/JobCard';
import AccountMenu from '@/components/AccountMenu';
import StreakStrip from '@/components/StreakStrip';
import NearbyEngineersStrip from '@/components/NearbyEngineersStrip';
import PendingProductsCard from '@/components/PendingProductsCard';
import { useBannerStackHeight } from '@/lib/bannerLayout';
import type { AttendanceEffectiveStatus } from '@/lib/types';

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function formatLoggedHours(markedAt: string, endDayAt: string): string {
  const ms = new Date(endDayAt).getTime() - new Date(markedAt).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

// Org-wide open-notification counts per department, cycled across a fixed palette
// purely for visual variety (no per-department meaning) — matches the PWA
// dashboard's DEPARTMENT_CARD_COLORS.
const DEPARTMENT_CARD_COLORS = [
  { color: '#2563EB', bg: '#DBEAFE' },
  { color: '#D97706', bg: '#FEF3C7' },
  { color: '#7D1D3F', bg: '#F9EEF2' },
  { color: '#059669', bg: '#D1FAE5' },
  { color: '#5B21B6', bg: '#EDE9FE' },
  { color: '#EA580C', bg: '#FED7AA' },
  { color: '#475569', bg: '#F1F5F9' },
];

// Mirrors the PWA dashboard's attendanceCardStyle() — orange while the 10am window is
// still open, red once Absent (or an amendment is pending/rejected), green once Present
// is confirmed. Holiday/Weekly Off get a neutral color.
function attendanceCardStyle(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string; sub: string | null } {
  switch (status.kind) {
    case 'pending':
      return { bg: '#FEF3C7', color: '#92400E', label: 'Punch in', sub: 'Before 10:00 AM' };
    case 'leave': {
      const causes = [status.lateIn && 'Late In', status.earlyOut && 'Short Hours', status.singlePunch && 'Single Punch'].filter(Boolean).join(', ');
      return {
        bg: '#FEE2E2', color: '#991B1B', label: causes ? `Absent (${causes})` : 'Absent',
        sub: status.pendingApproval ? 'Approval is Pending'
          : status.rejected ? 'Amendment rejected — request again'
          : status.markedAt && !status.endDayAt ? 'Punch out to finish your day'
          : status.noShow ? 'Attendance not marked today'
          : 'Request an amendment',
      };
    }
    case 'present': {
      const flags: string[] = [];
      if (status.lateIn) flags.push('Late In');
      if (status.earlyOut) flags.push('Short Hours');
      if (status.singlePunch) flags.push('Single Punch');
      const label = flags.length ? `Present (${flags.join(', ')})` : 'Present';
      const sub = flags.length ? (status.rejected ? 'Amendment rejected' : status.pendingApproval ? 'Approval is Pending' : status.amended ? 'Approved' : null) : null;
      const bg = flags.length && !status.amended ? (status.rejected ? '#FEE2E2' : '#FEF3C7') : '#D1FAE5';
      const color = flags.length && !status.amended ? (status.rejected ? '#991B1B' : '#92400E') : '#065F46';
      return { bg, color, label, sub };
    }
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
  const { data: deptData } = useDepartmentCounts();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const bannerStackHeight = useBannerStackHeight();
  const unreadAlerts = alertsData?.unreadCount ?? 0;

  const markEndDay = useMarkEndDay();
  const [endDayError, setEndDayError] = useState('');
  // GPS captures silently in the background as soon as End Day becomes available —
  // same single-step pattern as the Attendance tab — so the button here is a genuine
  // single tap with no separate "capture location" step.
  const endDayCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const endDayPlaceNameRef = useRef('');
  const endDayGpsRequestedRef = useRef(false);
  const attendanceStatus = data?.attendanceStatus;
  // A punched-in day that hasn't been punched out — Present (on-time) or Absent (late
  // punch-in) both still need a Punch Out, so the dashboard offers it for both.
  const canPunchOut = !!attendanceStatus
    && (attendanceStatus.kind === 'present' || attendanceStatus.kind === 'leave')
    && !!attendanceStatus.markedAt && !attendanceStatus.endDayAt;

  useEffect(() => {
    if (!canPunchOut || endDayGpsRequestedRef.current) return;
    endDayGpsRequestedRef.current = true;
    getCurrentPositionWithFallback().then(pos => {
      endDayCoordsRef.current = pos;
      if (pos) reverseGeocode(pos.lat, pos.lng).then(({ label }) => { if (label) endDayPlaceNameRef.current = label; }).catch(() => {});
    });
  }, [canPunchOut]);

  // Punch Out only records — no reason, no gate. Under 6h settles as Short Hours (Absent)
  // server-side; the engineer requests an amendment separately if they want it reviewed.
  async function handleEndDay() {
    setEndDayError('');
    try {
      const result = await markEndDay.mutateAsync({
        latitude: endDayCoordsRef.current?.lat ?? null,
        longitude: endDayCoordsRef.current?.lng ?? null,
        placeName: endDayPlaceNameRef.current || null,
      });
      if (result.error) setEndDayError(result.error);
    } catch (e) {
      setEndDayError(apiErrorMessage(e));
    }
  }

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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 + bannerStackHeight }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7D1D3F" />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hi, {engineerName || data?.engineer?.name || 'Engineer'}</Text>
          <Text style={styles.subGreeting}>Here&apos;s your day at a glance</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.bellButton} onPress={() => router.push('/(app)/(tabs)/alerts')}>
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
        const status = data.attendanceStatus;
        const cfg = attendanceCardStyle(status);

        // Detailed card for any punched-in day (Present on-time, or Absent late-in) —
        // check-in/out times, and until punched out, a Punch Out button.
        if ((status.kind === 'present' || status.kind === 'leave') && status.markedAt) {
          const ended = !!status.endDayAt;
          const bigLabel = ended && status.kind === 'present'
            ? `Today: ${formatLoggedHours(status.markedAt, status.endDayAt!)}`
            : cfg.label;
          return (
            <View style={[styles.attendanceCard, styles.attendanceCardColumn, { backgroundColor: cfg.bg }]}>
              <View style={styles.attendanceCardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attendanceEyebrow, { color: cfg.color }]}>ATTENDANCE</Text>
                  <Text style={[styles.attendanceLabel, { color: cfg.color }]}>{bigLabel}</Text>
                  <Text style={[styles.attendanceSub, { color: cfg.color }]}>
                    Punched in {formatClockTime(status.markedAt)}{status.placeName ? ` — ${status.placeName}` : ''}
                  </Text>
                  {ended && (
                    <Text style={[styles.attendanceSub, { color: cfg.color }]}>
                      Punched out {formatClockTime(status.endDayAt!)}{status.endDayPlaceName ? ` — ${status.endDayPlaceName}` : ''}
                    </Text>
                  )}
                  {ended && cfg.sub && <Text style={[styles.attendanceSub, { color: cfg.color }]}>{cfg.sub}</Text>}
                  {status.amended && status.approvedByName && (
                    <Text style={[styles.attendanceSub, { color: cfg.color }]}>
                      Approved by {status.approvedByName}{status.approvedAt ? ` — ${formatClockTime(status.approvedAt)}` : ''}
                    </Text>
                  )}
                </View>
                {!ended && (
                  <Pressable
                    style={styles.endDayButton}
                    onPress={handleEndDay}
                    disabled={markEndDay.isPending}
                  >
                    {markEndDay.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.endDayButtonText}>Punch Out</Text>}
                  </Pressable>
                )}
              </View>
              {ended && status.kind === 'leave' && !status.pendingApproval && (
                <Pressable style={styles.amendButton} onPress={() => router.push('/(app)/(tabs)/attendance')}>
                  <Text style={styles.amendButtonText}>Request Amendment</Text>
                </Pressable>
              )}
              {!!endDayError && <Text style={styles.endDayError}>{endDayError}</Text>}
            </View>
          );
        }

        const clickable = status.kind === 'pending' || status.kind === 'leave';
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
        {(deptData?.counts ?? []).map((dept, i) => {
          const c = DEPARTMENT_CARD_COLORS[i % DEPARTMENT_CARD_COLORS.length];
          return (
            <Pressable
              key={dept.departmentId}
              style={[styles.statCard, { borderTopWidth: 3, borderTopColor: c.color }]}
              onPress={() => router.push({ pathname: '/(app)/(tabs)/department-jobs/[dept]', params: { dept: dept.departmentId, name: dept.department } })}
            >
              <Text style={[styles.statValue, { color: c.color }]}>{dept.count}</Text>
              <Text style={styles.statLabel}>{dept.department}</Text>
              <Text style={styles.statSubLabel}>open</Text>
            </Pressable>
          );
        })}
      </View>

      {data?.streak && <StreakStrip streak={data.streak} />}

      {data?.pendingProducts && <PendingProductsCard items={data.pendingProducts} />}

      <Text style={styles.sectionTitle}>Your next jobs</Text>
      {data?.recentJobs.length ? (
        data.recentJobs.map(wo => <JobCard key={wo.id} wo={wo} />)
      ) : (
        <Text style={styles.empty}>No recent jobs</Text>
      )}

      <NearbyEngineersStrip />

      <Text style={styles.versionText}>
        App version {Application.nativeApplicationVersion ?? '—'}
        {Application.nativeBuildVersion ? ` (${Application.nativeBuildVersion})` : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  versionText: { fontSize: 10, color: '#B0A8AC', textAlign: 'center', marginTop: 18, marginBottom: 4 },
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
  attendanceCardColumn: { flexDirection: 'column', alignItems: 'stretch' },
  attendanceCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attendanceEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, opacity: 0.75, marginBottom: 2 },
  attendanceLabel: { fontSize: 15, fontWeight: '700' },
  attendanceSub: { fontSize: 11, opacity: 0.85, marginTop: 1 },
  attendanceChevron: { fontSize: 22, fontWeight: '700' },
  endDayButton: { backgroundColor: '#7D1D3F', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16 },
  endDayButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  amendButton: { marginTop: 10, borderWidth: 1, borderColor: '#991B1B', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  amendButtonText: { color: '#991B1B', fontSize: 12, fontWeight: '700' },
  endDayError: { color: '#DC2626', fontSize: 10, marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flexBasis: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#7D1D3F', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#7A6870', marginTop: 2 },
  statSubLabel: { fontSize: 9, color: '#9CA3AF', marginTop: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
});
