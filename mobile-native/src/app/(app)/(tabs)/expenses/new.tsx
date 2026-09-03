import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import RNWorkOrderPicker from '@/components/RNWorkOrderPicker';
import RNExpenseTypePicker from '@/components/RNExpenseTypePicker';
import RNPhotoField from '@/components/RNPhotoField';
import { useJobs, useExpenseEligibility, useSubmitExpenseLog } from '@/lib/hooks';
import { isOnline, apiErrorMessage } from '@/lib/offlineSubmit';
import { CITY_TIER_LABEL } from '@/lib/types';
import type { ClaimType } from '@/lib/types';

function todayLocal() {
  return new Date().toLocaleDateString('en-CA');
}
function formatDateDisplay(s: string) {
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NewExpenseScreen() {
  const { wo } = useLocalSearchParams<{ wo?: string }>();
  const router = useRouter();
  const { data: jobsData } = useJobs('active');
  const submitExpenseLog = useSubmitExpenseLog();

  const [workOrderId, setWorkOrderId] = useState(wo || '');
  const [expenseTypeId, setExpenseTypeId] = useState('');
  const [expenseTypeName, setExpenseTypeName] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayLocal());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [photo, setPhoto] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isLodging = /lodging|boarding/i.test(expenseTypeName);
  const [claimType, setClaimType] = useState<ClaimType>('flat');
  // Enabled whenever a project is selected (not only for lodging) so the expense-lock on
  // a Field-Engineer-created notification awaiting approval is picked up too.
  const { data: eligibilityData } = useExpenseEligibility(workOrderId, !!workOrderId);
  const eligibility = eligibilityData?.eligibility ?? null;
  const lockReason = eligibilityData?.locked ? (eligibilityData.lockReason || 'Expenses are blocked for this notification.') : null;

  useEffect(() => {
    if (eligibility?.grade) {
      const preferFlat = eligibility.flatAvailable;
      setClaimType(preferFlat ? 'flat' : 'actual');
      if (preferFlat && eligibility.flatLimit != null && !amount) setAmount(String(eligibility.flatLimit));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibility?.grade]);

  function handleClaimTypeChange(type: ClaimType) {
    setClaimType(type);
    if (type === 'flat' && eligibility?.flatLimit != null) setAmount(String(eligibility.flatLimit));
  }

  function onDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) setExpenseDate(selectedDate.toLocaleDateString('en-CA'));
  }

  async function handleSubmit() {
    setSubmitError('');
    if (!workOrderId) { setSubmitError('Select the project'); return; }
    if (lockReason) { setSubmitError(lockReason); return; }
    if (!expenseTypeId) { setSubmitError('Select or add an expense type'); return; }
    if (!expenseDate) { setSubmitError('Select a date'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setSubmitError('Enter a valid amount'); return; }
    if (isLodging && eligibility?.grade && claimType === 'actual' && !photo) {
      setSubmitError('A bill/receipt photo is required for an actuals claim');
      return;
    }

    const variables = {
      workOrderId,
      expenseTypeId,
      expenseDate,
      amount: amountNum,
      claimType: isLodging && eligibility?.grade ? claimType : undefined,
      photo: photo ? { base64: photo, mimeType: 'image/jpeg', ext: 'jpg' } : undefined,
    };

    if (!(await isOnline())) {
      submitExpenseLog.mutate(variables);
      Alert.alert('Saved — will sync', "You're offline. This expense will be sent automatically once you're back online.");
      router.replace('/(app)/(tabs)/expenses');
      return;
    }

    try {
      const result = await submitExpenseLog.mutateAsync(variables);
      if (result.error) { setSubmitError(result.error); return; }
      setSubmitted(true);
    } catch (e) {
      setSubmitError(apiErrorMessage(e));
    }
  }

  const submitting = submitExpenseLog.isPending;

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Stack.Screen options={{ headerShown: true, title: 'Expense Logged', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Expense logged</Text>
        <Text style={styles.successSub}>Your supervisor will review it shortly.</Text>
        <View style={styles.successRow}>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace(`/(app)/(tabs)/expenses/${workOrderId}`)}>
            <Text style={styles.secondaryButtonText}>View project logs</Text>
          </Pressable>
          <Pressable
            style={styles.successButton}
            onPress={() => { setSubmitted(false); setAmount(''); setPhoto(''); setExpenseTypeId(''); setExpenseTypeName(''); setExpenseDate(todayLocal()); }}
          >
            <Text style={styles.successButtonText}>Add another</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Add Expense', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Project <Text style={styles.required}>*</Text></Text>
          <RNWorkOrderPicker workOrders={jobsData?.workOrders || []} value={workOrderId} onChange={setWorkOrderId} placeholder="Select a project…" />
          {lockReason && <Text style={styles.lockNote}>{lockReason}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Expense type <Text style={styles.required}>*</Text></Text>
          <RNExpenseTypePicker
            valueId={expenseTypeId}
            valueName={expenseTypeName}
            onChange={(id, name) => { setExpenseTypeId(id); setExpenseTypeName(name); }}
          />
        </View>

        {isLodging && eligibility?.grade && (
          <View style={styles.card}>
            <Text style={styles.label}>Claim type</Text>
            <View style={styles.claimRow}>
              {eligibility.flatAvailable && (
                <Pressable style={[styles.claimButton, claimType === 'flat' && styles.claimButtonActive]} onPress={() => handleClaimTypeChange('flat')}>
                  <Text style={[styles.claimButtonText, claimType === 'flat' && styles.claimButtonTextActive]}>Flat allowance</Text>
                </Pressable>
              )}
              <Pressable style={[styles.claimButton, claimType === 'actual' && styles.claimButtonActive]} onPress={() => handleClaimTypeChange('actual')}>
                <Text style={[styles.claimButtonText, claimType === 'actual' && styles.claimButtonTextActive]}>Actuals (bill required)</Text>
              </Pressable>
            </View>
            <Text style={styles.eligibilityNote}>
              {eligibility.grade} · {CITY_TIER_LABEL[eligibility.cityTier]}
              {claimType === 'flat' && eligibility.flatLimit != null && ` · Eligible up to ₹${eligibility.flatLimit}, no bill needed`}
              {claimType === 'actual' && (eligibility.actualLimit != null
                ? ` · Eligible up to ₹${eligibility.actualLimit} against bills`
                : ' · No fixed cap — reimbursed against bills')}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.rowGap}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date <Text style={styles.required}>*</Text></Text>
              <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.inputText}>{formatDateDisplay(expenseDate)}</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Amount (₹) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${expenseDate}T00:00:00`)} mode="date" maximumDate={new Date()} onChange={onDateChange} />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Receipt photo{' '}
            <Text style={styles.photoHint}>
              {isLodging && eligibility?.grade && claimType === 'actual' ? '(required for actuals)' : '(optional)'}
            </Text>
          </Text>
          <RNPhotoField value={photo} onChange={setPhoto} />
        </View>

        {!!submitError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.submitButton, (submitting || !!lockReason) && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting || !!lockReason}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save expense</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 13, padding: 13, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14', marginBottom: 8 },
  photoHint: { fontSize: 10, fontWeight: '400', color: '#7A6870' },
  label: { fontSize: 11, fontWeight: '500', color: '#7A6870', marginBottom: 4 },
  required: { color: '#7D1D3F' },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff',
  },
  inputText: { color: '#1C0D14', fontSize: 12 },
  rowGap: { flexDirection: 'row', gap: 10 },
  claimRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  claimButton: { flex: 1, borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 8, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff' },
  claimButtonActive: { borderColor: '#7D1D3F', backgroundColor: '#F9EEF2' },
  claimButtonText: { fontSize: 12, fontWeight: '600', color: '#7A6870' },
  claimButtonTextActive: { color: '#7D1D3F' },
  eligibilityNote: { fontSize: 10, color: '#7A6870', lineHeight: 15 },
  lockNote: { marginTop: 8, backgroundColor: '#FEF3C7', color: '#92400E', fontSize: 11, lineHeight: 15, padding: 8, borderRadius: 8 },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12 },
  errorText: { color: '#DC2626', fontSize: 12 },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 16 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6', padding: 24 },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  successIconText: { fontSize: 26, color: '#059669', fontWeight: '700' },
  successTitle: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 4 },
  successSub: { fontSize: 12, color: '#7A6870', marginBottom: 20 },
  successRow: { flexDirection: 'row', gap: 10 },
  successButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: '#7D1D3F' },
  successButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  secondaryButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#fff' },
  secondaryButtonText: { color: '#1C0D14', fontSize: 13, fontWeight: '600' },
});
