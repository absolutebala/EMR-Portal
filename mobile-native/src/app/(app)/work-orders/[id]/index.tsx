import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useWorkOrderDetail } from '@/lib/hooks';
import { JOB_TYPE_LABELS, STATUS_CONFIG } from '@/lib/constants';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function WorkOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useWorkOrderDetail(id);
  const detail = data?.detail;

  const steps = useMemo(() => {
    if (!detail) return [];
    const wo = detail.workOrder;
    const everPending = wo.status === 'pending' || wo.status === 'needs_reassignment' || detail.latestClosure?.outcome === 'pending';
    const STEP_ORDER = everPending
      ? [{ key: 'assigned', label: 'Assigned' }, { key: 'in_progress', label: 'In Progress' }, { key: 'pending', label: 'Pending' }, { key: 'completed', label: 'Closed' }]
      : [{ key: 'assigned', label: 'Assigned' }, { key: 'in_progress', label: 'In Progress' }, { key: 'completed', label: 'Closed' }];
    const statusKey = wo.status === 'unassigned' ? 'assigned' : wo.status === 'needs_reassignment' ? 'pending' : wo.status;
    const currentIndex = Math.max(0, STEP_ORDER.findIndex(s => s.key === statusKey));
    return STEP_ORDER.map((s, i) => ({
      label: s.label,
      done: i < currentIndex || (i === currentIndex && s.key === 'completed'),
      current: i === currentIndex,
    }));
  }, [detail]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Notification', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Notification', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
        <Text style={styles.errorText}>{data?.error || 'Notification not found'}</Text>
      </View>
    );
  }

  const wo = detail.workOrder;
  const st = STATUS_CONFIG[wo.status] || STATUS_CONFIG.assigned;
  const isClosed = wo.status === 'completed';
  const needsReassignment = wo.status === 'needs_reassignment';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: wo.wo_number, headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <View style={styles.progressBar}>
        <Text style={styles.progressLabel}>Job status progression</Text>
        <View style={styles.stepsRow}>
          {steps.map((step, i) => (
            <View key={step.label} style={styles.stepWrap}>
              <View style={styles.stepDotOuter}>
                <View style={[styles.stepDot, step.done ? styles.stepDotDone : step.current ? styles.stepDotCurrent : styles.stepDotPending]}>
                  <Text style={styles.stepDotText}>{step.done ? '✓' : i + 1}</Text>
                </View>
              </View>
              <Text style={[styles.stepLabel, step.current && styles.stepLabelCurrent]}>{step.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actionPanel}>
        <View style={[styles.badge, { backgroundColor: st.bg, alignSelf: 'flex-start', marginBottom: 10 }]}>
          <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
        </View>

        {needsReassignment ? (
          <View style={styles.noticeOrange}>
            <Text style={styles.noticeOrangeText}>
              This job is flagged for reassignment to a different engineer. It will reappear here once your
              supervisor assigns it to someone.
            </Text>
          </View>
        ) : isClosed ? (
          <View style={styles.noticeGreen}>
            <Text style={styles.noticeGreenText}>This visit is marked completed.</Text>
          </View>
        ) : (
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push(
              detail.hasCheckedIn ? `/(app)/work-orders/${id}/closure` : `/(app)/work-orders/${id}/checkin`
            )}
          >
            <Text style={styles.primaryButtonTitle}>
              {detail.hasCheckedIn ? 'End of day closure' : 'Check in at project'}
            </Text>
            <Text style={styles.primaryButtonSub}>
              {detail.hasCheckedIn ? "Mark today's work complete or pending" : 'Capture GPS + photo to start work'}
            </Text>
          </Pressable>
        )}

        <Pressable style={styles.secondaryButton} onPress={() => router.push(`/(app)/work-orders/${id}/form`)}>
          <Text style={styles.secondaryButtonText}>{detail.hasFormSubmission ? 'Review job form' : 'Fill job form'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/(app)/requests/new', params: { wo: id } })}>
          <Text style={styles.secondaryButtonText}>Request products</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/(app)/expenses/new', params: { wo: id } })}>
          <Text style={styles.secondaryButtonText}>Log expense</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notification details</Text>
        <InfoRow label="Notification" value={wo.wo_number} highlight />
        <InfoRow label="Job type" value={JOB_TYPE_LABELS[wo.job_type] || wo.job_type} />
        <InfoRow label="Serial number(s)" value={wo.serial_numbers.join(', ') || '—'} highlight />
        <InfoRow label="Scheduled date" value={formatDate(wo.scheduled_date)} last />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer information</Text>
        <InfoRow label="Customer" value={wo.customer_name} />
        <InfoRow label="Contact" value={wo.customer_contact || '—'} />
        <InfoRow label="Phone" value={wo.customer_phone || '—'} />
        <InfoRow label="Project" value={wo.site_name || '—'} />
        <InfoRow label="Project address" value={wo.site_address || '—'} last />
      </View>

      {detail.handoverFromOtherEngineer && detail.latestClosure && (
        <View style={[styles.card, styles.handoverCard]}>
          <Text style={styles.handoverTitle}>Handed over from {detail.latestClosure.engineerName}</Text>
          <InfoRow label="Last visited" value={formatDateTime(detail.latestClosure.created_at)} />
          <InfoRow
            label="Outcome"
            value={
              detail.latestClosure.outcome === 'completed'
                ? 'Completed'
                : detail.latestClosure.needsReassignment
                  ? 'Needs reassignment'
                  : 'Pending'
            }
            last={!detail.latestClosure.pendingReason}
          />
          {!!detail.latestClosure.pendingReason && <InfoRow label="Reason" value={detail.latestClosure.pendingReason} last />}
        </View>
      )}

      {detail.hasCheckedIn && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Check-in</Text>
          <InfoRow label="Last checked in" value={formatDateTime(detail.lastCheckinAt)} last />
        </View>
      )}

      {detail.previousVisits.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Previous visits</Text>
          {detail.previousVisits.map((v, i) => (
            <View key={i} style={styles.visitRow}>
              <Text style={styles.visitJobType}>{JOB_TYPE_LABELS[v.job_type] || v.job_type}</Text>
              <Text style={styles.visitMeta}>
                {v.wo_number} · {formatDate(v.scheduled_date)} · {STATUS_CONFIG[v.status]?.label || v.status}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value, highlight, last }: { label: string; value: string; highlight?: boolean; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6' },
  errorText: { color: '#DC2626', fontSize: 13 },

  progressBar: { backgroundColor: '#3A0A1C', padding: 16 },
  progressLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 },
  stepsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepWrap: { alignItems: 'center', flex: 1 },
  stepDotOuter: { alignItems: 'center' },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepDotDone: { backgroundColor: '#059669', borderColor: '#059669' },
  stepDotCurrent: { backgroundColor: '#7D1D3F', borderColor: '#E8A0B8' },
  stepDotPending: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.2)' },
  stepDotText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  stepLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 5, textAlign: 'center' },
  stepLabelCurrent: { color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  actionPanel: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 14 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  noticeOrange: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10, padding: 12 },
  noticeOrangeText: { fontSize: 12, color: '#9A3412' },
  noticeGreen: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 10, padding: 12 },
  noticeGreenText: { fontSize: 12, color: '#065F46' },
  primaryButton: { backgroundColor: '#7D1D3F', borderRadius: 10, padding: 14 },
  primaryButtonTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  primaryButtonSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
  secondaryButton: { borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#F8F5F6', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  secondaryButtonText: { fontSize: 12, color: '#7A6870', fontWeight: '500' },

  card: { backgroundColor: '#fff', borderRadius: 13, padding: 14, margin: 16, marginBottom: 0 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#1C0D14', marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 10 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E0E3' },
  infoLabel: { fontSize: 12, color: '#7A6870' },
  infoValue: { fontSize: 12, fontWeight: '500', color: '#1C0D14', textAlign: 'right', flexShrink: 1 },
  infoValueHighlight: { color: '#7D1D3F' },

  handoverCard: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  handoverTitle: { fontSize: 12, fontWeight: '600', color: '#9A3412', marginBottom: 8 },

  visitRow: { backgroundColor: '#F8F5F6', borderRadius: 8, padding: 10, marginBottom: 6 },
  visitJobType: { fontSize: 12, fontWeight: '500', color: '#1C0D14' },
  visitMeta: { fontSize: 10, color: '#7A6870', marginTop: 2 },
});
