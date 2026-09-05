import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getCurrentPositionWithFallback } from '@/lib/gps';
import { reverseGeocode, useAttendanceCalendar, useMarkAttendance, useMarkEndDay, useRequestAmendment, useMyProfile } from '@/lib/hooks';
import AppVersionFooter from '@/components/AppVersionFooter';
import { apiGet } from '@/lib/api';
import { apiErrorMessage } from '@/lib/offlineSubmit';
import type { AttendanceEffectiveStatus, AttendanceCalendarDay, AttendanceCalendarResponse } from '@/lib/types';

function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function mondayOf(d: Date): Date {
  const monday = new Date(d);
  const day = monday.getDay(); // 0 = Sunday
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  return monday;
}

function weekRange(anchor: Date): { from: string; to: string; label: string } {
  const monday = mondayOf(anchor);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: toDateStr(monday),
    to: toDateStr(sunday),
    label: `${monday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${sunday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
  };
}

function monthRangeFor(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toDateStr(from), to: toDateStr(to) };
}

// Same {from, to, label} shape as weekRange so the rest of the screen doesn't need
// to branch on view mode — just wraps monthRangeFor with a month-name label.
function monthRange(anchor: Date): { from: string; to: string; label: string } {
  const { from, to } = monthRangeFor(toDateStr(anchor));
  return { from, to, label: anchor.toLocaleDateString('en-IN', { month: 'long' }) };
}

function presentFlags(s: Extract<AttendanceEffectiveStatus, { kind: 'present' }>): string[] {
  const flags: string[] = [];
  if (s.lateIn) flags.push('Late In');
  if (s.earlyOut) flags.push('Short Hours');
  if (s.singlePunch) flags.push('Single Punch');
  return flags;
}

function leaveCauses(s: Extract<AttendanceEffectiveStatus, { kind: 'leave' }>): string {
  return [s.lateIn && 'Late In', s.earlyOut && 'Short Hours', s.singlePunch && 'Single Punch'].filter(Boolean).join(', ');
}

function getStatusBadge(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string } {
  switch (status.kind) {
    case 'present': {
      const flags = presentFlags(status);
      if (!flags.length) return { bg: '#D1FAE5', color: '#065F46', label: 'Present' };
      const bg = status.rejected ? '#FEE2E2' : status.pendingApproval ? '#FEF3C7' : '#D1FAE5';
      const color = status.rejected ? '#991B1B' : status.pendingApproval ? '#92400E' : '#065F46';
      return { bg, color, label: `Present (${flags.join(', ')})` };
    }
    case 'leave': {
      const causes = leaveCauses(status);
      const suffix = status.pendingApproval ? ' — pending approval' : status.rejected ? ' — amendment rejected' : '';
      return { bg: '#FEE2E2', color: '#991B1B', label: `Absent${causes ? ` (${causes})` : ''}${suffix}` };
    }
    case 'pending': return { bg: '#FEF3C7', color: '#92400E', label: 'Not marked yet' };
    case 'holiday': return { bg: '#F1F5F9', color: '#475569', label: `Holiday: ${status.name}` };
    case 'not_applicable': return { bg: '#F1F5F9', color: '#475569', label: '—' };
  }
}

function attendanceLabel(s: AttendanceEffectiveStatus): string {
  switch (s.kind) {
    case 'present': {
      const flags = presentFlags(s);
      if (!flags.length) return 'Present';
      const decision = s.rejected ? 'rejected' : s.pendingApproval ? 'pending approval' : s.amended ? 'approved' : null;
      return `Present (${flags.join(', ')}${decision ? ` — ${decision}` : ''})`;
    }
    case 'leave': {
      const causes = leaveCauses(s);
      const suffix = s.rejected ? ' — amendment rejected' : s.pendingApproval ? ' — pending approval' : '';
      return `Absent${causes ? ` (${causes})` : ''}${suffix}`;
    }
    case 'holiday': return `Holiday: ${s.name}`;
    case 'pending': return 'Pending';
    case 'not_applicable': return '—';
  }
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function exportDaysToXlsx(exportDays: AttendanceCalendarDay[], filename: string) {
  const headers = ['Date', 'Status', 'Punched In At', 'Reason', 'Approved By', 'Approved Date', 'Punched Out At', 'Punch Out Location'];
  const aoa = [headers, ...exportDays.map(d => {
    const markedAt = d.markedAt ? new Date(d.markedAt).toLocaleString('en-IN') : '';
    const reason = d.status.kind === 'present' || d.status.kind === 'leave' ? (d.status.reason || '') : '';
    const approvedBy = d.status.kind === 'present' || d.status.kind === 'leave' ? (d.status.approvedByName || '') : '';
    const approvedAt = d.status.kind === 'present' || d.status.kind === 'leave'
      ? (d.status.approvedAt ? new Date(d.status.approvedAt).toLocaleString('en-IN') : '')
      : '';
    const endDayAt = d.endDayAt ? new Date(d.endDayAt).toLocaleString('en-IN') : '';
    return [d.date, attendanceLabel(d.status), markedAt, reason, approvedBy, approvedAt, endDayAt, d.endDayPlaceName || ''];
  })];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const file = new File(Paths.document, filename);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Share attendance',
    });
  }
}

export default function AttendanceScreen() {
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const range = viewMode === 'week' ? weekRange(anchorDate) : monthRange(anchorDate);
  const todayStr = toDateStr(new Date());

  const { data, isLoading, error } = useAttendanceCalendar(range.from, range.to);
  const markAttendance = useMarkAttendance();
  const markEndDay = useMarkEndDay();
  const requestAmendment = useRequestAmendment();
  const { data: profileData } = useMyProfile();
  const engineerName = profileData?.profile ? `${profileData.profile.firstName} ${profileData.profile.lastName}` : 'Engineer';
  const queryClient = useQueryClient();

  // A Service Manager approving/rejecting an amendment happens on a different device
  // (desktop), so nothing here pushes an update — without this, "pending approval"
  // text keeps showing until the app is fully restarted. Skip the first focus, since
  // the query already fetches on mount.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) { hasFocusedOnce.current = true; return; }
      queryClient.invalidateQueries({ queryKey: ['attendance-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-status'] });
    }, [queryClient])
  );

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [gpsResolved, setGpsResolved] = useState(false);
  // Ref, not state — only guards against re-triggering the auto-capture effect
  // below, never read in JSX, so it doesn't need to be reactive.
  const gpsRequestedRef = useRef(false);
  const [markError, setMarkError] = useState('');

  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState('');
  const [amendError, setAmendError] = useState('');
  const [amendSubmitting, setAmendSubmitting] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const endDayGpsRequestedRef = useRef(false);
  const [endDayGpsResolved, setEndDayGpsResolved] = useState(false);
  const [endDayCoords, setEndDayCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [endDayPlaceName, setEndDayPlaceName] = useState('');
  const [endDayError, setEndDayError] = useState('');

  const [todayAmendReason, setTodayAmendReason] = useState('');
  const [todayAmendError, setTodayAmendError] = useState('');

  const todayEntry = data?.days.find(d => d.date === todayStr) ?? null;
  const todayStatus = todayEntry?.status ?? null;
  const hasPunchedIn = !!todayStatus && (todayStatus.kind === 'present' || todayStatus.kind === 'leave') && !!todayStatus.markedAt;
  const hasPunchedOut = !!todayStatus && (todayStatus.kind === 'present' || todayStatus.kind === 'leave') && !!todayStatus.endDayAt;
  const todayPending = !!todayStatus && (todayStatus.kind === 'present' || todayStatus.kind === 'leave') && todayStatus.pendingApproval;
  // Punch In: shown until they've punched in — on time (kind 'pending', before 10) or a
  // not-yet-marked day after 10 (late = a no-show 'leave').
  const showPunchIn = !hasPunchedIn && !todayPending
    && (todayStatus?.kind === 'pending' || (todayStatus?.kind === 'leave' && todayStatus.noShow));
  const isLatePunchIn = todayStatus?.kind === 'leave';
  const canPunchOutNow = hasPunchedIn && !hasPunchedOut;

  function goPrev() {
    setAnchorDate(d => {
      if (viewMode === 'week') { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }
      // Built from year/month directly (day pinned to 1) rather than mutating the
      // existing day-of-month — avoids JS's month-rollover quirk.
      return new Date(d.getFullYear(), d.getMonth() - 1, 1);
    });
  }
  function goNext() {
    setAnchorDate(d => {
      if (viewMode === 'week') { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }
      return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    });
  }

  function startGpsCapture() {
    gpsRequestedRef.current = true;
    getCurrentPositionWithFallback().then(pos => {
      setCoords(pos);
      setGpsResolved(true);
      if (pos) {
        reverseGeocode(pos.lat, pos.lng).then(({ label }) => { if (label) setPlaceName(label); }).catch(() => {});
      }
    });
  }

  // GPS starts capturing in the background as soon as marking is needed — no
  // separate "capture location" tap. The submit button is available right away
  // (see JSX below); if GPS hasn't resolved by the time it's tapped, coords just
  // go through null, same as an outright GPS failure already does.
  useEffect(() => {
    if (showPunchIn && !gpsRequestedRef.current) startGpsCapture();
  }, [showPunchIn]);

  async function handleMark() {
    setMarkError('');
    // Punch In simply records — no reason even if late. A late punch-in makes the day
    // Absent, and the engineer requests an amendment separately if they want it.
    try {
      const result = await markAttendance.mutateAsync({
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        placeName: placeName || null,
        reason: null,
      });
      if (result.error) { setMarkError(result.error); return; }
    } catch (e) {
      setMarkError(apiErrorMessage(e));
    }
  }

  // Same GPS-capture flow as marking Present, dedicated state — End Day is a separate
  // action from the app's own Sign Out (AccountMenu), which stays ungated.
  function startEndDayGpsCapture() {
    endDayGpsRequestedRef.current = true;
    getCurrentPositionWithFallback().then(pos => {
      setEndDayCoords(pos);
      setEndDayGpsResolved(true);
      if (pos) {
        reverseGeocode(pos.lat, pos.lng).then(({ label }) => { if (label) setEndDayPlaceName(label); }).catch(() => {});
      }
    });
  }

  // Punch Out is available any time after Punch In (no enable-time gate). Start the
  // background GPS capture as soon as it becomes relevant.
  useEffect(() => {
    if (canPunchOutNow && !endDayGpsRequestedRef.current) startEndDayGpsCapture();
  }, [canPunchOutNow]);

  async function handleEndDay() {
    setEndDayError('');
    try {
      const result = await markEndDay.mutateAsync({
        latitude: endDayCoords?.lat ?? null,
        longitude: endDayCoords?.lng ?? null,
        placeName: endDayPlaceName || null,
        reason: null,
      });
      if (result.error) { setEndDayError(result.error); return; }
    } catch (e) {
      setEndDayError(apiErrorMessage(e));
    }
  }

  // The one path that notifies the Service Manager — the engineer explicitly asks for an
  // Absent day (today's card, below) or a past day (calendar row) to be reviewed.
  async function submitAmendment(dateStr: string, reasonText: string, setErr: (m: string) => void, done: () => void) {
    setErr('');
    if (!reasonText.trim()) { setErr('Please give a reason for this amendment'); return; }
    try {
      const result = await requestAmendment.mutateAsync({ attendanceDate: dateStr, reason: reasonText.trim() });
      if (result.error) { setErr(result.error); return; }
      done();
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  }

  async function handleTodayAmendment() {
    await submitAmendment(todayStr, todayAmendReason, setTodayAmendError, () => setTodayAmendReason(''));
  }

  // Past Absent day this month with no pending request. Today is handled on its own card
  // above, so it's excluded here to avoid a duplicate form.
  function isAmendable(day: { date: string; status: AttendanceEffectiveStatus }): boolean {
    return day.status.kind === 'leave' && !day.status.pendingApproval
      && day.date !== todayStr && day.date.slice(0, 7) === todayStr.slice(0, 7);
  }

  function toggleDay(day: { date: string; status: AttendanceEffectiveStatus }) {
    if (!isAmendable(day)) return;
    if (expandedDate === day.date) { setExpandedDate(null); return; }
    setExpandedDate(day.date);
    setAmendReason(''); setAmendError('');
  }

  async function handleAmendSubmit(dateStr: string) {
    setAmendSubmitting(true);
    await submitAmendment(dateStr, amendReason, setAmendError, () => setExpandedDate(null));
    setAmendSubmitting(false);
  }

  async function handleExportWeek() {
    setExporting(true);
    setExportError('');
    try {
      const resp = await apiGet<AttendanceCalendarResponse>(`/api/mobile/v1/attendance/calendar?from=${range.from}&to=${range.to}`);
      if (resp.error) { setExportError(resp.error); return; }
      await exportDaysToXlsx(resp.days, `${engineerName}_attendance_${range.from}_to_${range.to}.xlsx`);
    } catch (e) {
      setExportError(apiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportMonth() {
    const { from, to } = monthRangeFor(todayStr);
    setExporting(true);
    setExportError('');
    try {
      const resp = await apiGet<AttendanceCalendarResponse>(`/api/mobile/v1/attendance/calendar?from=${from}&to=${to}`);
      if (resp.error) { setExportError(resp.error); return; }
      await exportDaysToXlsx(resp.days, `${engineerName}_attendance_${from}_to_${to}.xlsx`);
    } catch (e) {
      setExportError(apiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: 'Attendance', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />

      <View style={styles.weekNav}>
        <Pressable style={styles.navButton} onPress={goPrev} accessibilityLabel={viewMode === 'week' ? 'Previous week' : 'Previous month'}>
          <Text style={styles.navButtonText}>‹</Text>
        </Pressable>
        <View style={styles.tabPill}>
          <Pressable style={[styles.tabButton, viewMode === 'week' && styles.tabButtonActive]} onPress={() => setViewMode('week')}>
            <Text style={[styles.tabButtonText, viewMode === 'week' && styles.tabButtonTextActive]}>{viewMode === 'week' ? range.label : 'Week'}</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, viewMode === 'month' && styles.tabButtonActive]} onPress={() => setViewMode('month')}>
            <Text style={[styles.tabButtonText, viewMode === 'month' && styles.tabButtonTextActive]}>{viewMode === 'month' ? range.label : 'Month'}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.navButton} onPress={goNext} accessibilityLabel={viewMode === 'week' ? 'Next week' : 'Next month'}>
          <Text style={styles.navButtonText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.exportRow}>
        <Pressable style={[styles.exportButton, exporting && styles.exportButtonDisabled]} onPress={handleExportWeek} disabled={exporting}>
          <Text style={styles.exportButtonText}>Export Week</Text>
        </Pressable>
        <Pressable style={[styles.exportButton, exporting && styles.exportButtonDisabled]} onPress={handleExportMonth} disabled={exporting}>
          <Text style={styles.exportButtonText}>Export Month</Text>
        </Pressable>
      </View>
      {!!exportError && <Text style={styles.error}>{exportError}</Text>}

      {/* Punch In — a punch-in after 10:00 AM is recorded as Absent (Late In). */}
      {showPunchIn && (
        <View style={styles.markCard}>
          <Text style={styles.markTitle}>Punch In</Text>
          {isLatePunchIn && (
            <Text style={[styles.markSub, { color: '#92400E' }]}>
              It&apos;s past 10:00 AM — this will be recorded as Absent (Late In). You can request an amendment after you punch out.
            </Text>
          )}
          <Text style={[styles.locationStatus, { color: coords ? '#059669' : gpsResolved ? '#B91C1C' : '#7A6870' }]}>
            📍 {coords ? (placeName || 'Location captured') : gpsResolved ? 'Location unavailable — you can still punch in' : 'Getting your location…'}
          </Text>
          {!!markError && <Text style={styles.markError}>{markError}</Text>}
          <Pressable style={[styles.submitButton, markAttendance.isPending && styles.submitButtonDisabled]} onPress={handleMark} disabled={markAttendance.isPending}>
            {markAttendance.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Punch In</Text>}
          </Pressable>
        </View>
      )}

      {/* Punch Out — available any time after Punch In (compulsory). Under 6h = Short Hours. */}
      {canPunchOutNow && todayStatus && (
        <View style={styles.markCard}>
          <Text style={styles.markTitle}>Punch Out</Text>
          {(todayStatus.kind === 'present' || todayStatus.kind === 'leave') && todayStatus.markedAt && (
            <Text style={styles.markSub}>Punched in at {formatTimeOnly(todayStatus.markedAt)}. Punch Out is compulsory — under 6 hours is Short Hours (Absent).</Text>
          )}
          <Text style={[styles.locationStatus, { color: endDayCoords ? '#059669' : endDayGpsResolved ? '#B91C1C' : '#7A6870' }]}>
            📍 {endDayCoords ? (endDayPlaceName || 'Location captured') : endDayGpsResolved ? 'Location unavailable — you can still punch out' : 'Getting your location…'}
          </Text>
          {!!endDayError && <Text style={styles.markError}>{endDayError}</Text>}
          <Pressable style={[styles.submitButton, markEndDay.isPending && styles.submitButtonDisabled]} onPress={handleEndDay} disabled={markEndDay.isPending}>
            {markEndDay.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Punch Out</Text>}
          </Pressable>
        </View>
      )}

      {/* Today's outcome once resolved (punched out, or a pending/rejected request). */}
      {!showPunchIn && !canPunchOutNow && todayStatus && (todayStatus.kind === 'present' || todayStatus.kind === 'leave') && (todayStatus.markedAt || todayStatus.pendingApproval || todayStatus.rejected) && (() => {
        const s = todayStatus;
        const isPresent = s.kind === 'present';
        const causes = [s.lateIn && 'Late In', s.earlyOut && 'Short Hours', s.singlePunch && 'Single Punch'].filter(Boolean).join(', ');
        return (
          <View style={styles.markCard}>
            <Text style={[styles.markTitle, { color: isPresent ? '#065F46' : '#991B1B' }]}>
              {isPresent ? (causes ? `Present (${causes.toLowerCase()})` : 'Present') : `Absent${causes ? ` (${causes})` : ''}`}
            </Text>
            {s.markedAt && (
              <Text style={styles.reasonNote}>Punched in {formatTimeOnly(s.markedAt)}{s.endDayAt ? ` · Punched out ${formatTimeOnly(s.endDayAt)}` : ''}</Text>
            )}
            {s.pendingApproval && <Text style={[styles.reasonNote, { color: '#92400E' }]}>Approval is Pending — your Service Manager will review your amendment.</Text>}
            {s.rejected && <Text style={[styles.reasonNote, { color: '#991B1B' }]}>Amendment rejected{s.approvedByName ? ` by ${s.approvedByName}` : ''} — you can request again.</Text>}
            {isPresent && s.amended && s.approvedByName && <Text style={[styles.reasonNote, { color: '#065F46' }]}>Approved by {s.approvedByName}</Text>}
            {s.kind === 'leave' && !s.pendingApproval && (
              <>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Reason for amendment (required)"
                  placeholderTextColor="#9CA3AF"
                  value={todayAmendReason}
                  onChangeText={setTodayAmendReason}
                  multiline
                />
                {!!todayAmendError && <Text style={styles.markError}>{todayAmendError}</Text>}
                <Pressable style={[styles.outlineButton, requestAmendment.isPending && styles.submitButtonDisabled]} onPress={handleTodayAmendment} disabled={requestAmendment.isPending}>
                  {requestAmendment.isPending ? <ActivityIndicator color="#7D1D3F" /> : <Text style={styles.outlineButtonText}>Request Amendment</Text>}
                </Pressable>
              </>
            )}
          </View>
        );
      })()}

      {isLoading ? (
        <ActivityIndicator color="#7D1D3F" style={{ marginTop: 20 }} />
      ) : error || data?.error ? (
        <Text style={styles.error}>{data?.error || 'Failed to load attendance'}</Text>
      ) : (
        (data?.days ?? []).map(day => {
          const badge = getStatusBadge(day.status);
          const amendable = isAmendable(day);
          const expanded = expandedDate === day.date;
          const s = day.status;
          const hasReason = (s.kind === 'present' || s.kind === 'leave') && !!s.reason;
          const hasRequested = s.kind === 'leave' && (s.pendingApproval || s.rejected) && !!s.markedAt;
          const hasDecision = (s.kind === 'present' && s.amended) || (s.kind === 'leave' && s.rejected);
          const decisionLabel = s.kind === 'leave' && s.rejected ? 'Rejected' : 'Approved';
          return (
            <View key={day.date} style={styles.dayRow}>
              <Pressable style={styles.dayRowHeader} onPress={() => toggleDay(day)} disabled={!amendable}>
                <Text style={styles.dayLabel}>{formatDayLabel(day.date)}</Text>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </Pressable>
              {hasRequested && s.markedAt && (
                <Text style={styles.reasonNote}>Requested: {formatDateTime(s.markedAt)}</Text>
              )}
              {hasReason && (s.kind === 'present' || s.kind === 'leave') && (
                <Text style={styles.reasonNote}>Reason: {s.reason}</Text>
              )}
              {hasDecision && (s.kind === 'present' || s.kind === 'leave') && (
                <>
                  {s.approvedByName && <Text style={styles.reasonNote}>{decisionLabel} by: {s.approvedByName}</Text>}
                  {s.approvedAt && <Text style={styles.reasonNote}>{decisionLabel}: {formatDateTime(s.approvedAt)}</Text>}
                </>
              )}
              {amendable && !expanded && <Text style={styles.amendHint}>Tap to request an amendment →</Text>}
              {expanded && amendable && (
                <View style={styles.amendForm}>
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Reason (required)"
                    placeholderTextColor="#9CA3AF"
                    value={amendReason}
                    onChangeText={setAmendReason}
                    multiline
                  />

                  {!!amendError && <Text style={styles.markError}>{amendError}</Text>}

                  <Pressable style={[styles.submitButton, amendSubmitting && styles.submitButtonDisabled]} onPress={() => handleAmendSubmit(day.date)} disabled={amendSubmitting}>
                    {amendSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Request Amendment</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}

      <AppVersionFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 32 },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  navButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  navButtonText: { fontSize: 18, color: '#1C0D14', fontWeight: '600' },
  tabPill: { flex: 1, flexDirection: 'row', gap: 3, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 3 },
  tabButton: { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center' },
  tabButtonActive: {
    backgroundColor: '#fff', shadowColor: '#7D1D3F', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  tabButtonText: { fontSize: 12, fontWeight: '700', color: '#7A6870' },
  tabButtonTextActive: { color: '#1C0D14' },
  exportRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  exportButton: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#7D1D3F', backgroundColor: '#fff', alignItems: 'center' },
  exportButtonDisabled: { opacity: 0.6 },
  exportButtonText: { color: '#7D1D3F', fontSize: 11, fontWeight: '600' },
  markCard: { backgroundColor: '#fff', borderRadius: 13, padding: 14, marginBottom: 16 },
  markTitle: { fontSize: 13, fontWeight: '700', color: '#1C0D14', marginBottom: 4 },
  markSub: { fontSize: 11, color: '#7A6870', lineHeight: 16, marginBottom: 10 },
  locationStatus: { fontSize: 10, marginTop: 4, marginBottom: 8 },
  reasonInput: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff', marginTop: 10, minHeight: 60, textAlignVertical: 'top',
  },
  markError: { color: '#DC2626', fontSize: 11, marginTop: 8 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  outlineButton: { borderWidth: 1, borderColor: '#7D1D3F', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  outlineButtonText: { color: '#7D1D3F', fontSize: 13, fontWeight: '600' },
  error: { color: '#DC2626', fontSize: 12, marginBottom: 12 },
  dayRow: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 8 },
  dayRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  reasonNote: { fontSize: 10, color: '#7A6870', marginTop: 6 },
  amendHint: { fontSize: 10, color: '#7D1D3F', marginTop: 6, fontWeight: '600' },
  amendForm: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#F5F3F5', paddingTop: 10 },
});
