import { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert, Linking, Modal } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useWorkOrderDetail, useSubmitCheckIn, reverseGeocode } from '@/lib/hooks';
import { apiPost } from '@/lib/api';
import { getCurrentPositionWithFallback } from '@/lib/gps';
import { isOnline, apiErrorMessage } from '@/lib/offlineSubmit';
import { JOB_TYPE_LABELS, STATUS_CONFIG } from '@/lib/constants';
import * as Clipboard from 'expo-clipboard';
import RNSitePhotos from '@/components/RNSitePhotos';

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
  const submitCheckIn = useSubmitCheckIn();
  const [offlineChecking, setOfflineChecking] = useState(false);
  const [showForms, setShowForms] = useState(false);

  const qc = useQueryClient();
  const [otwBusy, setOtwBusy] = useState(false);
  const [customerMsg, setCustomerMsg] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  async function handleOnTheWay() {
    setOtwBusy(true); setCustomerMsg('');
    try {
      const res = await apiPost<{ error: string | null }>(`/api/mobile/v1/work-orders/${id}/on-the-way`);
      setCustomerMsg(res.error || 'Customer notified — on the way ✓');
    } catch (e) {
      setCustomerMsg(apiErrorMessage(e));
    } finally { setOtwBusy(false); }
  }
  function onRescheduleDateChange(_e: DateTimePickerEvent, d?: Date) {
    if (d) setRescheduleDate(d);
  }
  async function handleReschedule() {
    setRescheduleBusy(true); setCustomerMsg('');
    try {
      const newDate = rescheduleDate.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
      const res = await apiPost<{ error: string | null }>(`/api/mobile/v1/work-orders/${id}/reschedule`, { newDate });
      if (res.error) { setCustomerMsg(res.error); return; }
      setRescheduleOpen(false);
      setCustomerMsg('Rescheduled — customer notified ✓');
      qc.invalidateQueries({ queryKey: ['work-order', id] });
    } catch (e) {
      setCustomerMsg(apiErrorMessage(e));
    } finally { setRescheduleBusy(false); }
  }

  // "Offline Check-In": grab GPS on the spot and check in immediately — no photo, no
  // extra screen. GPS comes from the device sensor so it works without a connection;
  // if offline, the check-in is queued and auto-sent when back online (the server
  // fills in the place-name label from the coordinates at that point).
  const handleOfflineCheckIn = useCallback(async () => {
    if (offlineChecking) return;
    setOfflineChecking(true);
    try {
      const pos = await getCurrentPositionWithFallback();
      let placeName: string | null = null;
      if (pos) {
        try { const { label } = await reverseGeocode(pos.lat, pos.lng); if (label) placeName = label; } catch { /* label resolves server-side on sync */ }
      }
      const vars = {
        workOrderId: id, latitude: pos?.lat ?? null, longitude: pos?.lng ?? null,
        placeName, photoBase64: '', mimeType: '', ext: '', offline: true,
      };
      if (!(await isOnline())) {
        submitCheckIn.mutate(vars);
        Alert.alert('Saved — will sync', "You're offline. This check-in will be sent automatically once you're back online.");
        return;
      }
      const result = await submitCheckIn.mutateAsync(vars);
      if (result.error) { Alert.alert('Check-in failed', result.error); return; }
    } catch (e) {
      Alert.alert('Check-in failed', apiErrorMessage(e));
    } finally {
      setOfflineChecking(false);
    }
  }, [id, offlineChecking, submitCheckIn]);

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
  // Defensive: a notification cached by an older app build (persisted to AsyncStorage)
  // predates availableForms, so it can rehydrate here as undefined before the refetch
  // lands — guard so the screen never crashes on stale cache.
  const availableForms = detail.availableForms ?? [];
  const st = STATUS_CONFIG[wo.status] || STATUS_CONFIG.assigned;
  const isClosed = wo.status === 'completed';
  const needsReassignment = wo.status === 'needs_reassignment';

  return (
    <View style={styles.screen}>
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

      {!isClosed && (
        <View style={styles.customerActionRow}>
          <Pressable style={[styles.customerActionBtn, otwBusy && styles.customerActionBtnOff]} onPress={handleOnTheWay} disabled={otwBusy}>
            <Text style={styles.customerActionText}>{otwBusy ? 'Sending…' : 'On the Way'}</Text>
          </Pressable>
          <Pressable style={styles.customerActionBtn} onPress={() => { setCustomerMsg(''); setRescheduleDate(wo.scheduled_date ? new Date(wo.scheduled_date) : new Date()); setRescheduleOpen(true); }}>
            <Text style={styles.customerActionText}>Reschedule</Text>
          </Pressable>
        </View>
      )}
      {!!customerMsg && (
        <Text style={[styles.customerMsg, customerMsg.includes('✓') ? styles.customerMsgOk : styles.customerMsgErr]}>{customerMsg}</Text>
      )}

      <View style={styles.sitePhotosRow}>
        <RNSitePhotos workOrderId={wo.id} />
      </View>

      <Modal visible={rescheduleOpen} transparent animationType="slide" onRequestClose={() => setRescheduleOpen(false)}>
        <Pressable style={styles.rsBackdrop} onPress={() => setRescheduleOpen(false)}>
          <Pressable style={styles.rsCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.rsTitle}>Reschedule notification</Text>
            <Text style={styles.rsSub}>Pick a new date — the customer will be notified.</Text>
            <View style={styles.rsPickerWrap}>
              <DateTimePicker
                value={rescheduleDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={onRescheduleDateChange}
                style={styles.rsPicker}
              />
            </View>
            <Pressable style={[styles.rsBtn, rescheduleBusy && styles.customerActionBtnOff]} onPress={handleReschedule} disabled={rescheduleBusy}>
              <Text style={styles.rsBtnText}>{rescheduleBusy ? 'Rescheduling…' : 'Reschedule & notify'}</Text>
            </Pressable>
            <Pressable style={styles.rsCancel} onPress={() => setRescheduleOpen(false)} disabled={rescheduleBusy}>
              <Text style={styles.rsCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
        ) : detail.hasCheckedIn ? (
          <View style={styles.noticeInfo}>
            <Text style={styles.noticeInfoText}>Checked in. Submit any forms you need — then tap “Mark Completed” at the bottom to close the visit.</Text>
          </View>
        ) : (
          <View style={styles.checkinRow}>
            <Pressable
              style={[styles.primaryButton, styles.checkinHalf]}
              onPress={() => router.push(`/(app)/(tabs)/work-orders/${id}/checkin`)}
            >
              <Text style={styles.primaryButtonTitle}>Check in at project</Text>
              <Text style={styles.primaryButtonSub}>GPS + photo</Text>
            </Pressable>
            <Pressable
              style={[styles.offlineButton, styles.checkinHalf, offlineChecking && styles.offlineButtonBusy]}
              onPress={handleOfflineCheckIn}
              disabled={offlineChecking}
            >
              {offlineChecking ? (
                <ActivityIndicator color="#7D1D3F" />
              ) : (
                <>
                  <Text style={styles.offlineButtonTitle}>Offline Check-In</Text>
                  <Text style={styles.offlineButtonSub}>GPS only, no photo</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, showForms && styles.actionBtnActive]} onPress={() => setShowForms(v => !v)}>
            <Text style={[styles.actionBtnText, showForms && styles.actionBtnTextActive]}>Forms</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: '/(app)/(tabs)/requests/new', params: { wo: id } })}>
            <Text style={styles.actionBtnText} numberOfLines={1}>Product Request</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: '/(app)/(tabs)/expenses/new', params: { wo: id } })}>
            <Text style={styles.actionBtnText} numberOfLines={1}>Log Expense</Text>
          </Pressable>
        </View>

        {showForms && (
          availableForms.length === 0 ? (
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>No forms available yet</Text>
            </View>
          ) : (
            availableForms.map(f => (
              <View key={f.id}>
                <Pressable
                  style={styles.formButton}
                  onPress={() => router.push(`/(app)/(tabs)/work-orders/${id}/form?formId=${f.id}`)}
                >
                  <Text style={styles.formButtonText} numberOfLines={2}>{f.name}</Text>
                  {f.submitted
                    ? <Text style={styles.formSubmittedBadge}>Submitted</Text>
                    : <Text style={styles.formButtonChevron}>›</Text>}
                </Pressable>
                {f.submitted && (f.pdfUrl || f.wordUrl) && (
                  <View style={styles.formDownloadRow}>
                    {!!f.pdfUrl && (
                      <Pressable style={styles.formDownloadBtn} onPress={() => Linking.openURL(f.pdfUrl!)}>
                        <Text style={styles.formDownloadText}>⬇ PDF</Text>
                      </Pressable>
                    )}
                    {!!f.wordUrl && (
                      <Pressable style={styles.formDownloadBtn} onPress={() => Linking.openURL(f.wordUrl!)}>
                        <Text style={styles.formDownloadText}>⬇ Word</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))
          )
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notification details</Text>
        <InfoRow label="Notification" value={wo.wo_number} highlight />
        <InfoRow label="Job type" value={JOB_TYPE_LABELS[wo.job_type] || wo.job_type} />
        <InfoRow label="Serial number(s)" value={wo.serial_numbers.join(', ') || '—'} highlight />
        <InfoRow label="Scheduled date" value={formatDate(wo.scheduled_date)} last />
      </View>

      {(wo.customer_message || wo.notes) && (
        <View style={styles.card}>
          {wo.customer_message && (
            <View style={{ marginBottom: wo.notes ? 12 : 0 }}>
              <Text style={styles.msgLabel}>Customer message</Text>
              <Text style={styles.msgText}>{wo.customer_message}</Text>
            </View>
          )}
          {wo.notes && (
            <View>
              <Text style={styles.msgLabel}>Additional Information</Text>
              <Text style={styles.msgText}>{wo.notes}</Text>
            </View>
          )}
        </View>
      )}

      {wo.transformers.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product Details</Text>
          {wo.transformers.map((t, i) => (
            <View key={t.serialNumber + i} style={[styles.transformerRow, i > 0 && styles.transformerRowBordered]}>
              <Text style={styles.transformerSerial}>{t.serialNumber}</Text>
              <View style={styles.transformerMetaRow}>
                <Text style={styles.transformerMeta}>Dispatch date: {formatDate(t.dispatchDate)}</Text>
                <Text style={styles.transformerMeta}>Warranty: {t.warrantyYears != null ? `${t.warrantyYears} yr${t.warrantyYears === 1 ? '' : 's'}` : '—'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer information</Text>
        <InfoRow label="Customer" value={wo.customer_name} />
        <InfoRow label="Contact" value={wo.customer_contact || '—'} />
        <InfoRow label="Phone" value={wo.customer_phone || '—'} copyValue={wo.customer_phone || undefined} />
        <InfoRow label="End user type" value={wo.customer_type === 'utility' ? 'Utility' : wo.customer_type === 'industry' ? 'Industry' : wo.customer_type === 'oem' ? 'OEM' : '—'} />
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
          {!!detail.latestClosure.pendingReason && <InfoRow label="Reason" value={detail.latestClosure.pendingReason} last={!detail.handoverEngineerHasFormSubmission} />}
          {detail.handoverEngineerHasFormSubmission && (
            <Pressable
              style={styles.handoverFormButton}
              onPress={() => router.push({ pathname: '/(app)/(tabs)/work-orders/[id]/form', params: { id, view: detail.latestClosure!.engineerId! } })}
            >
              <Text style={styles.handoverFormButtonText}>View form entries filled by {detail.latestClosure.engineerName}</Text>
            </Pressable>
          )}
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
            <Pressable key={v.id} style={styles.visitRow} onPress={() => router.push(`/(app)/(tabs)/work-orders/${v.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.visitJobType}>{JOB_TYPE_LABELS[v.job_type] || v.job_type}</Text>
                <Text style={styles.visitMeta}>
                  {v.wo_number} · {formatDate(v.scheduled_date)} · {STATUS_CONFIG[v.status]?.label || v.status}
                </Text>
              </View>
              <Text style={styles.visitChevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
    {detail.hasCheckedIn && !isClosed && !needsReassignment && (
      availableForms.length > 0 && !availableForms.some(f => f.submitted) ? (
        <View style={styles.footer}>
          <Text style={styles.markCompletedHint}>Submit at least one form (with your signature) to enable Mark Completed.</Text>
        </View>
      ) : (
        <View style={styles.footer}>
          <Pressable style={styles.markCompletedBtn} onPress={() => router.push(`/(app)/(tabs)/work-orders/${id}/closure`)}>
            <Text style={styles.markCompletedText}>Mark Completed</Text>
          </Pressable>
        </View>
      )
    )}
    </View>
  );
}

function InfoRow({ label, value, highlight, last, copyValue }: { label: string; value: string; highlight?: boolean; last?: boolean; copyValue?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!copyValue) return;
    try { await Clipboard.setStringAsync(copyValue); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
        {!!copyValue && (
          <Pressable onPress={copy} hitSlop={8} style={[styles.copyBtn, copied && styles.copyBtnDone]}>
            <Text style={[styles.copyBtnText, copied && styles.copyBtnTextDone]}>{copied ? 'Copied ✓' : 'Copy'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F5F6' },
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { paddingBottom: 32 },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 14 },
  markCompletedBtn: { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  markCompletedHint: { fontSize: 12, color: '#7A6870', textAlign: 'center', paddingVertical: 4 },
  markCompletedText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  noticeInfo: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, padding: 12 },
  noticeInfoText: { color: '#1E40AF', fontSize: 12, lineHeight: 17 },
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

  sitePhotosRow: { flexDirection: 'row', justifyContent: 'flex-end', marginHorizontal: 16, marginTop: 12 },
  customerActionRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  customerActionBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#7D1D3F', borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  customerActionBtnOff: { opacity: 0.6 },
  customerActionText: { color: '#7D1D3F', fontSize: 12.5, fontWeight: '600' },
  customerMsg: { marginHorizontal: 16, marginTop: 8, fontSize: 11, textAlign: 'right' },
  customerMsgOk: { color: '#065F46' },
  customerMsgErr: { color: '#DC2626' },
  rsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  rsCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  rsTitle: { fontSize: 16, fontWeight: '700', color: '#1C0D14' },
  rsSub: { fontSize: 12, color: '#7A6870', marginTop: 3, marginBottom: 10 },
  rsPickerWrap: { alignItems: 'center', marginBottom: 12 },
  rsPicker: { width: '100%' },
  rsBtn: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  rsBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rsCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  rsCancelText: { color: '#7A6870', fontSize: 13, fontWeight: '600' },
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
  checkinRow: { flexDirection: 'row', gap: 10 },
  checkinHalf: { flex: 1, minHeight: 58, justifyContent: 'center' },
  offlineButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#7D1D3F', borderRadius: 10, padding: 14, alignItems: 'center' },
  offlineButtonBusy: { opacity: 0.7 },
  offlineButtonTitle: { color: '#7D1D3F', fontSize: 13, fontWeight: '600' },
  offlineButtonSub: { color: '#A8708A', fontSize: 11, marginTop: 2 },
  secondaryButton: { borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#F8F5F6', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  secondaryButtonText: { fontSize: 12, color: '#7A6870', fontWeight: '500' },
  formsLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#F8F5F6', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  actionBtnActive: { borderColor: '#7D1D3F', backgroundColor: '#F9EEF2' },
  actionBtnText: { fontSize: 11.5, color: '#7A6870', fontWeight: '600' },
  actionBtnTextActive: { color: '#7D1D3F' },
  formButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#F8F5F6', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 12, marginTop: 8 },
  formButtonText: { flex: 1, fontSize: 12.5, color: '#1C0D14', fontWeight: '600' },
  formButtonChevron: { fontSize: 20, color: '#B5A9AF', fontWeight: '400', lineHeight: 20 },
  formSubmittedBadge: { fontSize: 10, fontWeight: '700', color: '#166534', backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  formDownloadRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginLeft: 4 },
  formDownloadBtn: { borderWidth: 1, borderColor: '#7D1D3F', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  formDownloadText: { fontSize: 11, fontWeight: '700', color: '#7D1D3F' },

  card: { backgroundColor: '#fff', borderRadius: 13, padding: 14, margin: 16, marginBottom: 0 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#1C0D14', marginBottom: 8 },
  msgLabel: { fontSize: 11, fontWeight: '700', color: '#7D1D3F', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  msgText: { fontSize: 13, color: '#1C0D14', lineHeight: 19 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 10 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E0E3' },
  infoLabel: { fontSize: 12, color: '#7A6870' },
  infoValue: { fontSize: 12, fontWeight: '500', color: '#1C0D14', textAlign: 'right', flexShrink: 1 },
  infoValueHighlight: { color: '#7D1D3F' },
  infoValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, justifyContent: 'flex-end' },
  copyBtn: { backgroundColor: '#F9EEF2', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  copyBtnDone: { backgroundColor: '#ECFDF5' },
  copyBtnText: { fontSize: 10, fontWeight: '700', color: '#7D1D3F' },
  copyBtnTextDone: { color: '#065F46' },

  handoverCard: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  handoverTitle: { fontSize: 12, fontWeight: '600', color: '#9A3412', marginBottom: 8 },
  handoverFormButton: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FED7AA', backgroundColor: '#fff', alignItems: 'center' },
  handoverFormButtonText: { fontSize: 11, fontWeight: '600', color: '#9A3412' },
  transformerRow: { paddingVertical: 8 },
  transformerRowBordered: { borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  transformerSerial: { fontSize: 12, fontWeight: '600', color: '#1C0D14', marginBottom: 4 },
  transformerMetaRow: { flexDirection: 'row', gap: 16 },
  transformerMeta: { fontSize: 11, color: '#7A6870' },

  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8F5F6', borderRadius: 8, padding: 10, marginBottom: 6 },
  visitJobType: { fontSize: 12, fontWeight: '500', color: '#1C0D14' },
  visitMeta: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  visitChevron: { fontSize: 18, color: '#B5A9AF', lineHeight: 18 },
});
