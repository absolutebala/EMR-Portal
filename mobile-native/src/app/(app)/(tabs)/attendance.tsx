import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { getCurrentPositionWithFallback } from '@/lib/gps';
import { reverseGeocode, useAttendanceCalendar, useMarkAttendance } from '@/lib/hooks';
import { apiErrorMessage } from '@/lib/offlineSubmit';
import type { AttendanceEffectiveStatus } from '@/lib/types';

function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function getStatusBadge(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string } {
  switch (status.kind) {
    case 'present': return { bg: '#D1FAE5', color: '#065F46', label: status.amended ? 'Present (amended)' : 'Present' };
    case 'leave': return { bg: '#FEE2E2', color: '#991B1B', label: status.pendingApproval ? 'Leave — pending approval' : status.rejected ? 'Leave — amendment rejected' : 'Leave' };
    case 'pending': return { bg: '#FEF3C7', color: '#92400E', label: 'Not marked yet' };
    case 'holiday': return { bg: '#F1F5F9', color: '#475569', label: `Holiday: ${status.name}` };
    case 'weekly_off': return { bg: '#F1F5F9', color: '#475569', label: 'Weekly Off' };
    case 'not_applicable': return { bg: '#F1F5F9', color: '#475569', label: '—' };
  }
}

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AttendanceScreen() {
  const { from, to } = useMemo(() => {
    const today = new Date();
    const fromD = new Date(today);
    fromD.setDate(fromD.getDate() - 6);
    return { from: toDateStr(fromD), to: toDateStr(today) };
  }, []);

  const { data, isLoading, error } = useAttendanceCalendar(from, to);
  const markAttendance = useMarkAttendance();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [gpsResolved, setGpsResolved] = useState(false);
  const [gpsRequested, setGpsRequested] = useState(false);
  const [reason, setReason] = useState('');
  const [markError, setMarkError] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const todayEntry = data?.days.find(d => d.date === to) ?? null;
  const todayStatus = todayEntry?.status ?? null;
  const needsMarking = todayStatus?.kind === 'pending' || todayStatus?.kind === 'leave';
  const isLate = todayStatus?.kind === 'leave';
  const isPendingApproval = todayStatus?.kind === 'leave' && todayStatus.pendingApproval;

  function startGpsCapture() {
    setGpsRequested(true);
    getCurrentPositionWithFallback().then(pos => {
      setCoords(pos);
      setGpsResolved(true);
      if (pos) {
        reverseGeocode(pos.lat, pos.lng).then(({ label }) => { if (label) setPlaceName(label); }).catch(() => {});
      }
    });
  }

  async function handleMark() {
    setMarkError('');
    if (isLate && !reason.trim()) {
      setMarkError('Please give a reason for marking attendance after 11:00 AM');
      return;
    }
    try {
      const result = await markAttendance.mutateAsync({
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        placeName: placeName || null,
        reason: isLate ? reason.trim() : null,
      });
      if (result.error) { setMarkError(result.error); return; }
      if (result.needsApproval) {
        Alert.alert('Submitted for approval', "Your attendance amendment has been sent to your Service Manager for approval.");
      }
      setReason('');
    } catch (e) {
      setMarkError(apiErrorMessage(e));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: 'Attendance', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />

      {needsMarking && todayStatus && (
        <View style={styles.markCard}>
          <Text style={styles.markTitle}>{todayStatus.kind === 'pending' ? "Mark today's attendance" : 'Request to mark today present'}</Text>
          {isLate && (
            <Text style={styles.markSub}>
              {isPendingApproval
                ? "Your amendment request is pending your Service Manager's approval."
                : todayStatus.kind === 'leave' && todayStatus.rejected
                  ? 'Your previous request was rejected — you can submit again with a new reason.'
                  : "The 11:00 AM window has passed — this will need your Service Manager's approval."}
            </Text>
          )}

          {!isPendingApproval && (
            <>
              {!gpsRequested ? (
                <Pressable style={styles.gpsButton} onPress={startGpsCapture}>
                  <Text style={styles.gpsButtonText}>Capture location &amp; continue</Text>
                </Pressable>
              ) : (
                <View style={[styles.gpsCard, { backgroundColor: coords ? '#059669' : '#2563EB' }]}>
                  <Text style={styles.gpsTitle}>{coords ? (placeName || 'GPS location captured') : gpsResolved ? 'GPS unavailable' : 'GPS location capturing…'}</Text>
                </View>
              )}

              {gpsRequested && isLate && (
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Reason (required)"
                  placeholderTextColor="#9CA3AF"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                />
              )}

              {!!markError && <Text style={styles.markError}>{markError}</Text>}

              {gpsRequested && gpsResolved && (
                <Pressable style={[styles.submitButton, markAttendance.isPending && styles.submitButtonDisabled]} onPress={handleMark} disabled={markAttendance.isPending}>
                  {markAttendance.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{isLate ? 'Submit for approval' : 'Mark present'}</Text>}
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Last 7 days</Text>
      {isLoading ? (
        <ActivityIndicator color="#7D1D3F" style={{ marginTop: 20 }} />
      ) : error || data?.error ? (
        <Text style={styles.error}>{data?.error || 'Failed to load attendance'}</Text>
      ) : (
        [...(data?.days ?? [])].reverse().map(day => {
          const badge = getStatusBadge(day.status);
          const expanded = expandedDate === day.date;
          return (
            <Pressable key={day.date} style={styles.dayRow} onPress={() => setExpandedDate(expanded ? null : day.date)}>
              <View style={styles.dayRowHeader}>
                <Text style={styles.dayLabel}>{formatDayLabel(day.date)}</Text>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>
              {day.status.kind === 'present' && day.status.reason && <Text style={styles.reasonNote}>Reason: {day.status.reason}</Text>}
              {expanded && (
                <View style={styles.activityList}>
                  {day.activity.length === 0 ? (
                    <Text style={styles.activityEmpty}>No notification activity this day</Text>
                  ) : (
                    day.activity.map((a, i) => (
                      <View key={i} style={styles.activityItem}>
                        <Text style={styles.activityAction}>{a.action}</Text>
                        <Text style={styles.activityTime}>{new Date(a.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 32 },
  markCard: { backgroundColor: '#fff', borderRadius: 13, padding: 14, marginBottom: 16 },
  markTitle: { fontSize: 13, fontWeight: '700', color: '#1C0D14', marginBottom: 4 },
  markSub: { fontSize: 11, color: '#7A6870', lineHeight: 16, marginBottom: 10 },
  gpsButton: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  gpsButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  gpsCard: { borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  gpsTitle: { fontSize: 12, fontWeight: '600', color: '#fff', textAlign: 'center' },
  reasonInput: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff', marginTop: 10, minHeight: 60, textAlignVertical: 'top',
  },
  markError: { color: '#DC2626', fontSize: 11, marginTop: 8 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1C0D14', marginBottom: 10 },
  error: { color: '#DC2626', fontSize: 12 },
  dayRow: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 8 },
  dayRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  reasonNote: { fontSize: 10, color: '#7A6870', marginTop: 6 },
  activityList: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#F5F3F5', paddingTop: 8 },
  activityEmpty: { fontSize: 11, color: '#9CA3AF' },
  activityItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  activityAction: { fontSize: 11, color: '#374151', flex: 1, marginRight: 8 },
  activityTime: { fontSize: 10, color: '#9CA3AF' },
});
