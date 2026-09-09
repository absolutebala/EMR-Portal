import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { PUNCH_CATEGORIES } from '@/lib/punchCategory';
import type { PunchCategory } from '@/lib/types';

export interface PunchInPayload {
  category: PunchCategory;
  visitCustomerName: string | null;
  visitSiteAddress: string | null;
  visitPurpose: string | null;
}

// Punch-in flow: pick a work category, then (for the four non-HQ categories) fill the
// mandatory visit details before continuing to the actual GPS check-in the parent runs.
export default function PunchInModal({ visible, onCancel, onConfirm, submitting, error }: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (p: PunchInPayload) => void;
  submitting: boolean;
  error: string;
}) {
  const [category, setCategory] = useState<PunchCategory | null>(null);
  const [customer, setCustomer] = useState('');
  const [site, setSite] = useState('');
  const [purpose, setPurpose] = useState('');

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (visible) { setCategory(null); setCustomer(''); setSite(''); setPurpose(''); }
  }, [visible]);

  function pick(id: PunchCategory) {
    if (id === 'hq') { onConfirm({ category: 'hq', visitCustomerName: null, visitSiteAddress: null, visitPurpose: null }); return; }
    setCategory(id);
  }

  const detailsValid = !!customer.trim() && !!site.trim() && !!purpose.trim();
  const meta = PUNCH_CATEGORIES.find(c => c.id === category);

  function submitDetails() {
    if (!category || !detailsValid) return;
    onConfirm({ category, visitCustomerName: customer.trim(), visitSiteAddress: site.trim(), visitPurpose: purpose.trim() });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!category ? (
              <>
                <Text style={styles.title}>What are you doing today?</Text>
                <Text style={styles.sub}>Choose one to continue punching in.</Text>
                {PUNCH_CATEGORIES.map(c => (
                  <Pressable key={c.id} style={styles.opt} onPress={() => pick(c.id)} disabled={submitting}>
                    <View style={[styles.dot, { backgroundColor: c.bg }]}>
                      <Text style={[styles.dotText, { color: c.tx }]}>{c.tag}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optLabel}>{c.label}</Text>
                      <Text style={styles.optDesc}>{c.desc}</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                ))}
                {!!error && <Text style={styles.err}>{error}</Text>}
                <Pressable style={styles.cancel} onPress={onCancel} disabled={submitting}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={() => setCategory(null)} disabled={submitting}><Text style={styles.back}>‹ Change category</Text></Pressable>
                {meta && (
                  <View style={[styles.cathdr, { backgroundColor: meta.bg }]}>
                    <View style={[styles.dotSm, { backgroundColor: meta.ac }]}><Text style={styles.dotSmText}>{meta.tag}</Text></View>
                    <Text style={[styles.cathdrText, { color: meta.tx }]}>{meta.label}</Text>
                  </View>
                )}
                <Text style={styles.label}>Customer Name <Text style={styles.req}>*</Text></Text>
                <TextInput style={styles.input} value={customer} onChangeText={setCustomer} placeholder="e.g. Transformers & Electricals Kerala" placeholderTextColor="#9CA3AF" />
                <Text style={styles.label}>Site Address <Text style={styles.req}>*</Text></Text>
                <TextInput style={[styles.input, styles.multiline]} value={site} onChangeText={setSite} placeholder="Substation / plant address" placeholderTextColor="#9CA3AF" multiline />
                <Text style={styles.label}>Purpose of Visit <Text style={styles.req}>*</Text></Text>
                <TextInput style={[styles.input, styles.multiline]} value={purpose} onChangeText={setPurpose} placeholder="Why is this visit happening?" placeholderTextColor="#9CA3AF" multiline />
                {!!error && <Text style={styles.err}>{error}</Text>}
                <Pressable style={[styles.continue, (!detailsValid || submitting) && styles.continueOff]} onPress={submitDetails} disabled={!detailsValid || submitting}>
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.continueText}>Continue</Text>}
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingBottom: 24, paddingTop: 8, maxHeight: '88%' },
  grabber: { width: 40, height: 4, borderRadius: 4, backgroundColor: '#E5E0E3', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#1C0D14', marginBottom: 3 },
  sub: { fontSize: 12, color: '#7A6870', marginBottom: 14 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#EFE7EA', borderRadius: 13, padding: 12, marginBottom: 10 },
  dot: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontWeight: '800', fontSize: 12 },
  optLabel: { fontSize: 14, fontWeight: '700', color: '#1C0D14' },
  optDesc: { fontSize: 11, color: '#7A6870' },
  chev: { fontSize: 22, color: '#B9AEB3' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { color: '#7A6870', fontSize: 13, fontWeight: '600' },
  back: { color: '#7D1D3F', fontSize: 13, fontWeight: '600', paddingVertical: 4, marginBottom: 6 },
  cathdr: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, padding: 11, marginBottom: 14 },
  dotSm: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dotSmText: { color: '#fff', fontWeight: '800', fontSize: 9 },
  cathdrText: { fontWeight: '700', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 5 },
  req: { color: '#DC2626' },
  input: { borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 11, fontSize: 14, color: '#1C0D14', backgroundColor: '#fff', marginBottom: 12 },
  multiline: { minHeight: 62, textAlignVertical: 'top' },
  continue: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 2 },
  continueOff: { opacity: 0.5 },
  continueText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  err: { color: '#DC2626', fontSize: 12, marginBottom: 8 },
});
