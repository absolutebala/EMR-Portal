import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import RNSignaturePad from '@/components/RNSignaturePad';
import { useSubmitClosure } from '@/lib/hooks';

const PENDING_REASONS = [
  'Spare part unavailable',
  'Waiting for parts delivery',
  'Customer not available',
  'Technical dependency',
  'Project access issue',
  'Other',
];

function formatDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toDateOnlyString(d: Date) {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local-time convention used throughout this app
}

export default function ClosureScreen() {
  const { id, offsite } = useLocalSearchParams<{ id: string; offsite?: string }>();
  const router = useRouter();
  const offSite = offsite === '1';
  const submitClosure = useSubmitClosure();

  const [outcome, setOutcome] = useState<'completed' | 'pending' | null>(offSite ? 'completed' : null);
  const [summary, setSummary] = useState('');
  const [pendingReason, setPendingReason] = useState(PENDING_REASONS[0]);
  const [materialsRequired, setMaterialsRequired] = useState('');
  const [revisitDate, setRevisitDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [needsReassignment, setNeedsReassignment] = useState(false);
  const [engineerSignature, setEngineerSignature] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientSignature, setClientSignature] = useState('');
  const [error, setError] = useState('');

  function onDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) setRevisitDate(selectedDate);
  }

  async function handleSubmit() {
    if (!outcome) return;
    if (!summary.trim()) {
      setError(outcome === 'completed' ? 'Please describe what was completed today' : 'Please describe what remains to be done');
      return;
    }
    if (outcome === 'pending' && !revisitDate) {
      setError('Please provide a follow-up date');
      return;
    }
    if (!engineerSignature) { setError('Engineer signature is required'); return; }
    if (!clientName.trim()) { setError('Client name is required'); return; }
    if (!offSite && !clientSignature) { setError('Client signature is required'); return; }

    setError('');
    try {
      const result = await submitClosure.mutateAsync({
        workOrderId: id,
        outcome,
        summary: summary.trim(),
        pendingReason: outcome === 'pending' ? pendingReason : null,
        materialsRequired: outcome === 'pending' ? (materialsRequired.trim() || null) : null,
        revisitDate: outcome === 'pending' && revisitDate ? toDateOnlyString(revisitDate) : null,
        needsReassignment: outcome === 'pending' ? needsReassignment : false,
        engineerSignature,
        clientName: clientName.trim(),
        clientSignature: offSite ? '' : clientSignature,
        offSite,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace(`/(app)/work-orders/${id}`);
    } catch {
      Alert.alert('Saved — will sync', "You're offline. This closure will be sent automatically once you're back online.");
      router.replace(`/(app)/work-orders/${id}`);
    }
  }

  const submitting = submitClosure.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: 'End of Day', headerTintColor: '#7D1D3F' }} />
      <View style={styles.dateBanner}>
        <Text style={styles.dateBannerText}>{formatDate(new Date())}</Text>
      </View>

      {offSite ? (
        <View style={styles.offsiteNotice}>
          <Text style={styles.offsiteNoticeText}>
            Marking this complete without being on-site — the customer signature will be skipped, and your manager
            will be notified.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How did today&apos;s work go? *</Text>
          <View style={styles.outcomeRow}>
            <Pressable
              style={[styles.outcomeCard, outcome === 'completed' && styles.outcomeCardCompletedActive]}
              onPress={() => setOutcome('completed')}
            >
              <Text style={styles.outcomeTitle}>Job completed</Text>
              <Text style={styles.outcomeSub}>All work done today</Text>
            </Pressable>
            <Pressable
              style={[styles.outcomeCard, outcome === 'pending' && styles.outcomeCardPendingActive]}
              onPress={() => setOutcome('pending')}
            >
              <Text style={styles.outcomeTitle}>Pending — continue</Text>
              <Text style={styles.outcomeSub}>Work incomplete today</Text>
            </Pressable>
          </View>
        </View>
      )}

      {outcome === 'completed' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today&apos;s work summary</Text>
          <Text style={styles.label}>What was done today? *</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={3}
            value={summary}
            onChangeText={setSummary}
            placeholder="Briefly describe what work was completed today…"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      )}

      {outcome === 'pending' && (
        <>
          <View style={styles.pendingNotice}>
            <Text style={styles.pendingNoticeText}>
              This notification stays In Progress with a follow-up date — your supervisor will be notified.
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Reason *</Text>
            <View style={styles.reasonRow}>
              {PENDING_REASONS.map(r => (
                <Pressable
                  key={r}
                  style={[styles.reasonPill, pendingReason === r && styles.reasonPillActive]}
                  onPress={() => setPendingReason(r)}
                >
                  <Text style={[styles.reasonPillText, pendingReason === r && styles.reasonPillTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>Remarks *</Text>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={3}
              value={summary}
              onChangeText={setSummary}
              placeholder="Describe what remains to be done…"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Materials / parts required</Text>
            <TextInput
              style={styles.textarea}
              multiline
              numberOfLines={2}
              value={materialsRequired}
              onChangeText={setMaterialsRequired}
              placeholder="List required parts or materials…"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Follow-up date *</Text>
            <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
              <Text style={revisitDate ? styles.inputText : styles.inputPlaceholder}>
                {revisitDate ? formatDate(revisitDate) : 'Select date'}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker value={revisitDate || new Date()} mode="date" minimumDate={new Date()} onChange={onDateChange} />
            )}

            <Pressable
              style={[styles.reassignRow, needsReassignment && styles.reassignRowActive]}
              onPress={() => setNeedsReassignment(v => !v)}
            >
              <View style={[styles.checkbox, needsReassignment && styles.checkboxChecked]}>
                {needsReassignment && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reassignTitle}>This job needs a different engineer</Text>
                <Text style={styles.reassignSub}>Flags it for your supervisor to reassign.</Text>
              </View>
            </Pressable>
          </View>
        </>
      )}

      {!!outcome && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visit sign-off</Text>
          <RNSignaturePad label="Engineer signature *" value={engineerSignature} onChange={setEngineerSignature} />

          <Text style={styles.label}>Client name *</Text>
          <TextInput
            style={styles.input}
            value={clientName}
            onChangeText={setClientName}
            placeholder="Name of customer representative"
            placeholderTextColor="#9CA3AF"
          />

          {!offSite && (
            <RNSignaturePad label="Client signature *" value={clientSignature} onChange={setClientSignature} />
          )}

          {outcome === 'completed' && (
            <Text style={styles.pdfNote}>Marking completed generates a summary PDF and sends it to SAP.</Text>
          )}
        </View>
      )}

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!!outcome && (
        <Pressable
          style={[styles.submitButton, { backgroundColor: submitting ? '#A8294F' : outcome === 'completed' ? '#059669' : '#D97706' }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.submitText}>{outcome === 'completed' ? 'Mark job completed' : 'Mark job pending'}</Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 32 },
  dateBanner: { backgroundColor: '#3A0A1C', borderRadius: 8, paddingVertical: 7, alignItems: 'center', marginBottom: 12 },
  dateBannerText: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  offsiteNotice: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 12, marginBottom: 12 },
  offsiteNoticeText: { color: '#92400E', fontSize: 11, lineHeight: 16 },
  card: { backgroundColor: '#fff', borderRadius: 13, padding: 13, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  outcomeRow: { flexDirection: 'row', gap: 8 },
  outcomeCard: { flex: 1, borderWidth: 2, borderColor: '#E5E0E3', backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center' },
  outcomeCardCompletedActive: { borderColor: '#059669', backgroundColor: '#ECFDF5' },
  outcomeCardPendingActive: { borderColor: '#D97706', backgroundColor: '#FEF3C7' },
  outcomeTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  outcomeSub: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  label: { fontSize: 11, fontWeight: '500', color: '#7A6870', marginBottom: 4 },
  textarea: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff', textAlignVertical: 'top', minHeight: 70,
  },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff', marginBottom: 4,
  },
  inputText: { color: '#1C0D14', fontSize: 12 },
  inputPlaceholder: { color: '#9CA3AF', fontSize: 12 },
  pendingNotice: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 12, marginBottom: 12 },
  pendingNoticeText: { color: '#991B1B', fontSize: 11, lineHeight: 16 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonPill: { borderWidth: 1, borderColor: '#E5E0E3', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  reasonPillActive: { borderColor: '#7D1D3F', backgroundColor: '#F9EEF2' },
  reasonPillText: { fontSize: 11, color: '#6B7280' },
  reasonPillTextActive: { color: '#7D1D3F', fontWeight: '600' },
  reassignRow: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E0E3', backgroundColor: '#F8F5F6', marginTop: 12,
  },
  reassignRowActive: { borderColor: '#7D1D3F', backgroundColor: '#F9EEF2' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: '#7D1D3F', borderColor: '#7D1D3F' },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  reassignTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  reassignSub: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  pdfNote: { fontSize: 10, color: '#7A6870', marginTop: 6, lineHeight: 15 },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#DC2626', fontSize: 12 },
  submitButton: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
