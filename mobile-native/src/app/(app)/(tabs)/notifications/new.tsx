import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useCustomers, useTransformersForCustomer, useCreateCustomer, useCreateNotification } from '@/lib/hooks';
import { apiErrorMessage } from '@/lib/offlineSubmit';

const JOB_TYPES: { value: string; label: string }[] = [
  { value: 'site_inspection', label: 'Site Inspection' },
  { value: 'amc', label: 'AMC' },
  { value: 'commissioning_activities', label: 'Commissioning' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'overhauling', label: 'Overhauling' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'installation', label: 'Installation' },
  { value: 'testing', label: 'Testing' },
  { value: 'business_opportunity', label: 'Business Opportunity' },
];

const CUSTOMER_TYPES: { value: 'sold' | 'shipped' | 'both'; label: string }[] = [
  { value: 'sold', label: 'Sold' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'both', label: 'Both' },
];

export default function NewNotificationScreen() {
  const router = useRouter();
  const { data: customersData } = useCustomers();
  const customers = customersData?.customers || [];

  const [jobType, setJobType] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [selectedTransformerIds, setSelectedTransformerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: transformersData } = useTransformersForCustomer(!addingCustomer ? customerId : undefined);
  const transformers = transformersData?.transformers || [];

  const createCustomer = useCreateCustomer();
  const createNotification = useCreateNotification();

  // New-customer sub-form
  const [cName, setCName] = useState('');
  const [cContact, setCContact] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cType, setCType] = useState<'sold' | 'shipped' | 'both'>('both');
  const [cPincode, setCPincode] = useState('');
  const [cSite, setCSite] = useState('');
  const [cSerial, setCSerial] = useState('');
  const [customerError, setCustomerError] = useState('');

  function toggleTransformer(id: string) {
    setSelectedTransformerIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  async function handleSaveCustomer() {
    setCustomerError('');
    if (!cName.trim()) { setCustomerError('Enter the customer name'); return; }
    if (!cContact.trim()) { setCustomerError('Enter a contact person'); return; }
    if (!cPhone.trim()) { setCustomerError('Enter a phone number'); return; }
    if (!/^\d{6}$/.test(cPincode.trim())) { setCustomerError('Enter a valid 6-digit pincode'); return; }
    try {
      const result = await createCustomer.mutateAsync({
        name: cName.trim(), contactPerson: cContact.trim(), phone: cPhone.trim(),
        type: cType, pincode: cPincode.trim(), siteName: cSite.trim() || null, serialNumber: cSerial.trim() || null,
      });
      if (result.error || !result.id) { setCustomerError(result.error || 'Could not add customer'); return; }
      setCustomerId(result.id);
      setAddingCustomer(false);
      setCName(''); setCContact(''); setCPhone(''); setCType('both'); setCPincode(''); setCSite(''); setCSerial('');
    } catch (e) {
      setCustomerError(apiErrorMessage(e));
    }
  }

  async function handleSubmit() {
    setError('');
    if (!jobType) { setError('Select a job type'); return; }
    try {
      const result = await createNotification.mutateAsync({
        jobType,
        customerId: customerId || null,
        transformerIds: selectedTransformerIds,
        notes: notes.trim() || null,
      });
      if (result.error || !result.id) { setError(result.error || 'Could not create notification'); return; }
      router.replace(`/(app)/(tabs)/work-orders/${result.id}`);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  const submitting = createNotification.isPending;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'New Notification', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.card}>
          <Text style={styles.label}>Job type <Text style={styles.required}>*</Text></Text>
          <View style={styles.chipWrap}>
            {JOB_TYPES.map(j => {
              const on = jobType === j.value;
              return (
                <Pressable key={j.value} onPress={() => setJobType(j.value)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{j.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Customer</Text>
            <Pressable onPress={() => setAddingCustomer(v => !v)}>
              <Text style={styles.linkText}>{addingCustomer ? 'Pick existing' : '＋ New customer'}</Text>
            </Pressable>
          </View>

          {!addingCustomer ? (() => {
            const selected = customers.find(c => c.id === customerId);
            const q = customerSearch.trim().toLowerCase();
            const matches = q ? customers.filter(c => c.name.toLowerCase().includes(q)) : customers;
            if (selected) {
              return (
                <View style={styles.selectedRow}>
                  <Text style={styles.selectedName}>{selected.name}</Text>
                  <Pressable onPress={() => { setCustomerId(''); setCustomerSearch(''); }}>
                    <Text style={styles.linkText}>Change</Text>
                  </Pressable>
                </View>
              );
            }
            return (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder="Search customer by name…"
                  placeholderTextColor="#9CA3AF"
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                />
                {customers.length === 0 && <Text style={styles.eligibilityNote}>No customers yet — add one.</Text>}
                {!!customerSearch.trim() && (
                  <View style={styles.searchList}>
                    {matches.length === 0 ? (
                      <Text style={styles.eligibilityNote}>No customer found. Tap “＋ New customer” above to add one.</Text>
                    ) : matches.slice(0, 25).map(c => (
                      <Pressable key={c.id} onPress={() => { setCustomerId(c.id); setCustomerSearch(''); }} style={styles.searchRow}>
                        <Text style={styles.searchRowText}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })() : (
            <View style={{ gap: 8 }}>
              <TextInput style={styles.input} placeholder="Customer name *" placeholderTextColor="#9CA3AF" value={cName} onChangeText={setCName} />
              <TextInput style={styles.input} placeholder="Contact person *" placeholderTextColor="#9CA3AF" value={cContact} onChangeText={setCContact} />
              <TextInput style={styles.input} placeholder="Phone *" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" value={cPhone} onChangeText={setCPhone} />
              <TextInput style={styles.input} placeholder="Pincode (6 digits) *" placeholderTextColor="#9CA3AF" keyboardType="number-pad" value={cPincode} onChangeText={setCPincode} />
              <View style={styles.chipWrap}>
                {CUSTOMER_TYPES.map(t => {
                  const on = cType === t.value;
                  return (
                    <Pressable key={t.value} onPress={() => setCType(t.value)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput style={styles.input} placeholder="Site name (optional)" placeholderTextColor="#9CA3AF" value={cSite} onChangeText={setCSite} />
              <TextInput style={styles.input} placeholder="Transformer serial no. (optional)" placeholderTextColor="#9CA3AF" value={cSerial} onChangeText={setCSerial} />
              {!!customerError && <Text style={styles.errorText}>{customerError}</Text>}
              <Pressable style={[styles.outlineButton, createCustomer.isPending && styles.submitButtonDisabled]} onPress={handleSaveCustomer} disabled={createCustomer.isPending}>
                {createCustomer.isPending ? <ActivityIndicator color="#7D1D3F" /> : <Text style={styles.outlineButtonText}>Save customer</Text>}
              </Pressable>
            </View>
          )}
        </View>

        {!addingCustomer && !!customerId && transformers.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Transformer(s)</Text>
            <View style={styles.chipWrap}>
              {transformers.map(t => {
                const on = selectedTransformerIds.includes(t.id);
                return (
                  <Pressable key={t.id} onPress={() => toggleTransformer(t.id)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t.serialNumber || '—'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Notes</Text>
          <TextInput style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline placeholder="What's the issue / requirement?" placeholderTextColor="#9CA3AF" value={notes} onChangeText={setNotes} />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>This notification will be assigned to you. A Service Manager must approve it before you can add expenses.</Text>
        </View>

        {!!error && (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create Notification</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 13, padding: 13, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '500', color: '#7A6870', marginBottom: 6 },
  required: { color: '#7D1D3F' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  linkText: { color: '#7D1D3F', fontSize: 11, fontWeight: '600' },
  input: { borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12, color: '#1C0D14', backgroundColor: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff' },
  chipOn: { borderColor: '#7D1D3F', backgroundColor: '#F9EEF2' },
  chipText: { fontSize: 11, color: '#1C0D14' },
  chipTextOn: { color: '#7D1D3F', fontWeight: '600' },
  eligibilityNote: { fontSize: 10, color: '#7A6870', lineHeight: 15 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: '#7D1D3F', backgroundColor: '#F9EEF2', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  selectedName: { fontSize: 13, fontWeight: '600', color: '#7D1D3F', flex: 1, marginRight: 8 },
  searchList: { marginTop: 6, borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, overflow: 'hidden' },
  searchRow: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F5F3F5' },
  searchRowText: { fontSize: 12, color: '#1C0D14' },
  infoCard: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12, marginBottom: 12 },
  infoText: { fontSize: 11, color: '#92400E', lineHeight: 16 },
  outlineButton: { borderWidth: 1, borderColor: '#7D1D3F', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  outlineButtonText: { color: '#7D1D3F', fontSize: 13, fontWeight: '600' },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12 },
  errorText: { color: '#DC2626', fontSize: 12 },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 16 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
