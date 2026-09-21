import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, RefreshControl, Alert } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDashboard, useAlerts, useDepartmentCounts, useMarkEndDay, useMarkAttendance, useMarkDayOff, useCancelDayOff, useUpdatePunchCategory, reverseGeocode } from '@/lib/hooks';
import { categoryMeta } from '@/lib/punchCategory';
import AppVersionFooter from '@/components/AppVersionFooter';
import { useAuth } from '@/lib/AuthContext';
import { getCurrentPositionWithFallback } from '@/lib/gps';
import { apiErrorMessage } from '@/lib/offlineSubmit';
import JobCard from '@/components/JobCard';
import AccountMenu from '@/components/AccountMenu';
import StreakStrip from '@/components/StreakStrip';
import NearbyEngineersStrip from '@/components/NearbyEngineersStrip';
import PendingProductsCard from '@/components/PendingProductsCard';
import AppUpdatePopup from '@/components/AppUpdatePopup';
import PunchInModal, { type PunchInPayload } from '@/components/PunchInModal';
import { useBannerStackHeight } from '@/lib/bannerLayout';
import type { AttendanceEffectiveStatus } from '@/lib/types';

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata',  hour: 'numeric', minute: '2-digit' });
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
// is confirmed. Holiday gets a neutral color.
function attendanceCardStyle(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string; sub: string | null } {
  switch (status.kind) {
    case 'pending':
      return { bg: '#FEF3C7', color: '#92400E', label: 'Punch in', sub: 'Before 10:00 AM' };
    case 'leave': {
      if (status.latePending) {
        return {
          bg: '#FFE0B2', color: '#9A5B00', label: 'Punched in Late',
          sub: status.pendingApproval ? 'Approval is Pending'
            : status.rejected ? 'Amendment rejected — request again'
            : !status.endDayAt ? 'Punch out to finish your day'
            : 'Request an amendment to make it Present',
        };
      }
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
    case 'day_off':
      return { bg: '#EDE9FE', color: '#5B21B6', label: 'Day Off', sub: status.name ? status.name : status.pendingApproval ? 'Pending approval' : status.rejected ? 'Rejected — try again' : null };
    case 'off':
      return { bg: '#F1F5F9', color: '#475569', label: status.approvedLeave ? 'On Leave' : 'Weekly Off', sub: status.approvedLeave ? 'Approved leave' : null };
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
  const markAttendance = useMarkAttendance();
  const markDayOff = useMarkDayOff();
  const cancelDayOff = useCancelDayOff();
  const updatePunchCategory = useUpdatePunchCategory();
  const [endDayError, setEndDayError] = useState('');
  const [punchInError, setPunchInError] = useState('');
  const [showPunchIn, setShowPunchIn] = useState(false);
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [changeStatusError, setChangeStatusError] = useState('');
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

  // Punch In can happen straight from the dashboard (no trip to the Attendance tab) —
  // available before punch-in whether the day is still open ('pending') or already
  // provisionally Absent ('leave' no-show, i.e. a late punch-in). GPS pre-captures the
  // same way End Day does so the button is a single tap.
  const punchInCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const punchInPlaceNameRef = useRef('');
  const punchInGpsRequestedRef = useRef(false);
  // Also punchable on a holiday — the day shows "Holiday · <name>" but the engineer can
  // still punch in if they worked, which overwrites the holiday/day-off for their record.
  const canPunchIn = !!attendanceStatus
    && (attendanceStatus.kind === 'pending' || attendanceStatus.kind === 'holiday' || (attendanceStatus.kind === 'leave' && attendanceStatus.noShow));
  // A 'leave' + no-show state means the attendance cutoff has already passed, so punching
  // in now is late — the modal collects an amendment reason inline instead of forcing a
  // separate trip to the Attendance tab.
  const punchInIsLate = attendanceStatus?.kind === 'leave' && !!attendanceStatus?.noShow;

  useEffect(() => {
    if (!canPunchIn || punchInGpsRequestedRef.current) return;
    punchInGpsRequestedRef.current = true;
    getCurrentPositionWithFallback().then(pos => {
      punchInCoordsRef.current = pos;
      if (pos) reverseGeocode(pos.lat, pos.lng).then(({ label }) => { if (label) punchInPlaceNameRef.current = label; }).catch(() => {});
    });
  }, [canPunchIn]);

  async function submitPunchIn(payload: PunchInPayload) {
    setPunchInError('');
    try {
      const result = await markAttendance.mutateAsync({
        latitude: punchInCoordsRef.current?.lat ?? null,
        longitude: punchInCoordsRef.current?.lng ?? null,
        placeName: punchInPlaceNameRef.current || null,
        reason: payload.lateReason ?? null,
        category: payload.category,
        visitCustomerName: payload.visitCustomerName,
        visitSiteAddress: payload.visitSiteAddress,
        visitPurpose: payload.visitPurpose,
      });
      if (result.error) { setPunchInError(result.error); return; }
      setShowPunchIn(false);
    } catch (e) {
      setPunchInError(apiErrorMessage(e));
    }
  }

  // Change today's work status (HQ / Travel / Site Visit / …) after punching in — reuses
  // the same category picker as Punch In, but only rewrites the category + visit details.
  async function submitChangeStatus(payload: PunchInPayload) {
    setChangeStatusError('');
    try {
      const result = await updatePunchCategory.mutateAsync({
        category: payload.category,
        visitCustomerName: payload.visitCustomerName,
        visitSiteAddress: payload.visitSiteAddress,
        visitPurpose: payload.visitPurpose,
      });
      if (result.error) { setChangeStatusError(result.error); return; }
      setShowChangeStatus(false);
    } catch (e) {
      setChangeStatusError(apiErrorMessage(e));
    }
  }

  function handleDayOff() {
    Alert.alert(
      'Mark today as Day Off?',
      'This needs manager approval and will stop you from punching in unless you cancel it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Day Off', style: 'destructive', onPress: async () => {
            setPunchInError('');
            try {
              const result = await markDayOff.mutateAsync({});
              if (result.error) setPunchInError(result.error);
            } catch (e) {
              setPunchInError(apiErrorMessage(e));
            }
          },
        },
      ],
    );
  }

  async function handleCancelDayOff() {
    setPunchInError('');
    try {
      const result = await cancelDayOff.mutateAsync({});
      if (result.error) setPunchInError(result.error);
    } catch (e) {
      setPunchInError(apiErrorMessage(e));
    }
  }

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
      <AppUpdatePopup prompt={data?.updatePrompt ?? null} />
      <PunchInModal visible={showPunchIn} onCancel={() => setShowPunchIn(false)} onConfirm={submitPunchIn} submitting={markAttendance.isPending} error={punchInError} isLate={punchInIsLate} />
      <PunchInModal
        visible={showChangeStatus}
        onCancel={() => setShowChangeStatus(false)}
        onConfirm={submitChangeStatus}
        submitting={updatePunchCategory.isPending}
        error={changeStatusError}
        title="Change your status"
        subtitle="Update what you're doing today."
      />
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
          // Punch Out is gated: 8h45m after an on-time Punch In, or 6:45 PM IST for a late one.
          const punchOutUnlocked = !status.endDayEnableAt || Date.now() >= new Date(status.endDayEnableAt).getTime();
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
                    style={[styles.endDayButton, (markEndDay.isPending || !punchOutUnlocked) && { backgroundColor: '#C9AEB8' }]}
                    onPress={handleEndDay}
                    disabled={markEndDay.isPending || !punchOutUnlocked}
                  >
                    {markEndDay.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.endDayButtonText}>{!punchOutUnlocked && status.endDayEnableAt ? `Opens ${formatClockTime(status.endDayEnableAt)}` : 'Punch Out'}</Text>}
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

        // Markable day (before punch-in): punch in or take a day off right here, no
        // trip to the Attendance tab.
        if (canPunchIn) {
          return (
            <View style={[styles.attendanceCard, { backgroundColor: cfg.bg, flexDirection: 'column', alignItems: 'stretch' }]}>
              <Text style={[styles.attendanceEyebrow, { color: cfg.color }]}>ATTENDANCE</Text>
              <Text style={[styles.attendanceLabel, { color: cfg.color }]}>{cfg.label}</Text>
              {cfg.sub && <Text style={[styles.attendanceSub, { color: cfg.color }]}>{cfg.sub}</Text>}
              <View style={styles.attendanceActions}>
                <Pressable style={[styles.punchInButton, markAttendance.isPending && styles.attendanceBtnDisabled]} onPress={() => { setPunchInError(''); setShowPunchIn(true); }} disabled={markAttendance.isPending || markDayOff.isPending}>
                  {markAttendance.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.punchInButtonText}>Punch In</Text>}
                </Pressable>
                {/* On a holiday the day is already off, so only Punch In is offered. */}
                {status.kind !== 'holiday' && (
                  <Pressable style={[styles.dayOffButton, markDayOff.isPending && styles.attendanceBtnDisabled]} onPress={handleDayOff} disabled={markAttendance.isPending || markDayOff.isPending}>
                    {markDayOff.isPending ? <ActivityIndicator color="#5B21B6" size="small" /> : <Text style={styles.dayOffButtonText}>Day Off</Text>}
                  </Pressable>
                )}
              </View>
              {!!punchInError && <Text style={styles.endDayError}>{punchInError}</Text>}
            </View>
          );
        }

        // A self-applied Day Off that's still pending (or was rejected) can be undone
        // here so an accidental tap doesn't lock the engineer out of punching in.
        if (status.kind === 'day_off' && (status.pendingApproval || status.rejected)) {
          return (
            <View style={[styles.attendanceCard, styles.attendanceCardColumn, { backgroundColor: cfg.bg }]}>
              <View>
                <Text style={[styles.attendanceEyebrow, { color: cfg.color }]}>ATTENDANCE</Text>
                <Text style={[styles.attendanceLabel, { color: cfg.color }]}>{cfg.label}</Text>
                {cfg.sub && <Text style={[styles.attendanceSub, { color: cfg.color }]}>{cfg.sub}</Text>}
              </View>
              <Pressable style={[styles.dayOffButton, { marginTop: 12 }, cancelDayOff.isPending && styles.attendanceBtnDisabled]} onPress={handleCancelDayOff} disabled={cancelDayOff.isPending}>
                {cancelDayOff.isPending ? <ActivityIndicator color="#5B21B6" size="small" /> : <Text style={styles.dayOffButtonText}>Cancel day off & punch in instead</Text>}
              </Pressable>
              {!!punchInError && <Text style={styles.endDayError}>{punchInError}</Text>}
            </View>
          );
        }

        const clickable = status.kind === 'leave';
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

      {/* Once punched in, show today's work status (from the punch-in category) and let
          the engineer change it. Hidden entirely before punch-in. */}
      {data?.attendanceStatus && (() => {
        const status = data.attendanceStatus;
        if (status.kind !== 'present' && status.kind !== 'leave') return null;
        if (!status.markedAt || !status.punchCategory) return null;
        const m = categoryMeta(status.punchCategory);
        if (!m) return null;
        return (
          <Pressable
            style={[styles.statusChip, { backgroundColor: m.bg }]}
            onPress={() => { setChangeStatusError(''); setShowChangeStatus(true); }}
          >
            <View style={[styles.statusDot, { backgroundColor: m.ac }]}>
              <Text style={styles.statusDotText}>{m.tag[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusEyebrow, { color: m.tx }]}>STATUS</Text>
              <Text style={[styles.statusLabel, { color: m.tx }]}>{m.label}</Text>
            </View>
            <Text style={[styles.statusChange, { color: m.tx }]}>Change ›</Text>
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

      <AppVersionFooter />
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
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 12,
  },
  statusDot: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statusDotText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  statusEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  statusLabel: { fontSize: 14, fontWeight: '700', marginTop: 1 },
  statusChange: { fontSize: 12, fontWeight: '700' },
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
  attendanceActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  punchInButton: { flex: 1, backgroundColor: '#7D1D3F', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  punchInButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dayOffButton: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#5B21B6', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  dayOffButtonText: { color: '#5B21B6', fontSize: 13, fontWeight: '700' },
  attendanceBtnDisabled: { opacity: 0.6 },
  amendButton: { marginTop: 10, borderWidth: 1, borderColor: '#991B1B', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  amendButtonText: { color: '#991B1B', fontSize: 12, fontWeight: '700' },
  endDayError: { color: '#DC2626', fontSize: 10, marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flexBasis: '31%', backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#7D1D3F', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#7A6870', marginTop: 2 },
  statSubLabel: { fontSize: 9, color: '#9CA3AF', marginTop: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
});
