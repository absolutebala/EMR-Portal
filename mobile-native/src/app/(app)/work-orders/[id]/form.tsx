import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useJobForm, useSubmitJobForm } from '@/lib/hooks';
import { getPrefillValue } from '@/lib/formPrefill';
import { isOnline, apiErrorMessage } from '@/lib/offlineSubmit';
import { JOB_TYPE_LABELS } from '@/lib/constants';
import FormFieldRow from '@/components/form/FormFieldRow';
import TableSection from '@/components/form/TableSection';
import type { FieldValues, RowValues } from '@/lib/types';

export default function JobFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error: loadError } = useJobForm(id);
  const submitJobForm = useSubmitJobForm();

  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [rowValues, setRowValues] = useState<RowValues>({});
  const [incompleteIds, setIncompleteIds] = useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [visitCompleted, setVisitCompleted] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [loadedDraft, setLoadedDraft] = useState(false);

  const draftKey = `emr-draft-${id}`;
  const workOrder = data?.workOrder;
  const form = data?.form;

  // Load initial state once the form/work-order data arrives: local draft takes
  // priority over an existing server submission, which takes priority over
  // prefill_from_job auto-fill — same precedence as the web version.
  useEffect(() => {
    if (!data || loadedDraft) return;
    (async () => {
      let loadedFields: FieldValues = {};
      let loadedRows: RowValues = {};

      const raw = await AsyncStorage.getItem(draftKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          loadedFields = parsed.fields || {};
          loadedRows = parsed.table_rows || {};
        } catch {
          // ignore corrupt draft
        }
      } else if (data.existingSubmission?.form_data) {
        loadedFields = data.existingSubmission.form_data.fields || {};
        loadedRows = data.existingSubmission.form_data.table_rows || {};
      }

      if (data.form && data.workOrder) {
        for (const sec of data.form.sections) {
          for (const f of sec.fields) {
            if (f.prefill_from_job && !loadedFields[f.id]) {
              const v = getPrefillValue(f.label, data.workOrder);
              if (v) loadedFields = { ...loadedFields, [f.id]: v };
            }
          }
        }
      }

      setFieldValues(loadedFields);
      setRowValues(loadedRows);
      setLoadedDraft(true);
    })();
  }, [data, loadedDraft, draftKey]);

  // Autosave every 5s (not on every keystroke) — a ref holds the latest values so the
  // interval always saves current state without needing to be recreated on every change.
  const latestValuesRef = useRef({ fieldValues, rowValues });
  latestValuesRef.current = { fieldValues, rowValues };

  useEffect(() => {
    if (!loadedDraft) return;
    async function saveDraft() {
      try {
        await AsyncStorage.setItem(draftKey, JSON.stringify({
          fields: latestValuesRef.current.fieldValues,
          table_rows: latestValuesRef.current.rowValues,
        }));
      } catch {
        // best-effort only
      }
    }
    const interval = setInterval(saveDraft, 5000);
    return () => { saveDraft(); clearInterval(interval); };
  }, [draftKey, loadedDraft]);

  const setField = useCallback((fieldId: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    setIncompleteIds(prev => {
      if (!prev.has(fieldId) || !value.trim()) return prev;
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
  }, []);

  const setRowStatus = useCallback((rowId: string, status: string) => {
    setRowValues(prev => ({ ...prev, [rowId]: { remarks: prev[rowId]?.remarks || '', status } }));
    setIncompleteIds(prev => {
      if (!prev.has(rowId) || !status) return prev;
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  }, []);

  const setRowRemarks = useCallback((rowId: string, remarks: string) => {
    setRowValues(prev => ({ ...prev, [rowId]: { status: prev[rowId]?.status || '', remarks } }));
    setIncompleteIds(prev => {
      if (!prev.has(rowId) || !remarks.trim()) return prev;
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  }, []);

  async function handleSubmit() {
    if (!form || !workOrder) return;
    setSubmitError('');

    // Every field and every table row must be filled — not just ones marked required
    // in the form builder. Carve-out: a field that's both prefill_from_job and
    // read_only_on_mobile can't be edited at all, so if auto-fill found no match,
    // blocking submission on it would be a dead end rather than real validation.
    const missing = new Set<string>();
    for (const sec of form.sections) {
      for (const f of sec.fields) {
        if (f.prefill_from_job && f.read_only_on_mobile) continue;
        if (!fieldValues[f.id]?.trim()) missing.add(f.id);
      }
      for (const t of sec.tables) {
        for (const row of t.rows) {
          const filled = t.status_type === 'measurement'
            ? !!rowValues[row.id]?.remarks?.trim()
            : !!rowValues[row.id]?.status;
          if (!filled) missing.add(row.id);
        }
      }
    }
    if (missing.size > 0) {
      setIncompleteIds(missing);
      setSubmitError(`You have ${missing.size} incomplete field${missing.size > 1 ? 's' : ''} — highlighted below.`);
      return;
    }
    setIncompleteIds(new Set());

    const variables = { workOrderId: id, formId: form.id, formData: { fields: fieldValues, table_rows: rowValues } };

    if (!(await isOnline())) {
      submitJobForm.mutate(variables);
      setSavedOffline(true);
      return;
    }

    try {
      const result = await submitJobForm.mutateAsync(variables);
      await AsyncStorage.removeItem(draftKey);
      setSubmitted(true);
      setVisitCompleted(!!result.completed);
    } catch (e) {
      setSubmitError(apiErrorMessage(e));
    }
  }

  if (isLoading || !loadedDraft) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Job Form', headerTintColor: '#7D1D3F' }} />
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  if (loadError || !workOrder) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Job Form', headerTintColor: '#7D1D3F' }} />
        <Text style={styles.errorText}>{data?.error || 'Notification not found'}</Text>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Job Form', headerTintColor: '#7D1D3F', headerBackVisible: false }} />
        <Text style={styles.successTitle}>{visitCompleted ? 'Visit completed!' : 'Form submitted!'}</Text>
        <Text style={styles.successBody}>
          {visitCompleted
            ? `The form for ${workOrder.wo_number} has been saved and the visit is marked completed — the summary PDF/Word doc has been generated.`
            : `The form for ${workOrder.wo_number} has been saved. Sign off below to mark the visit done.`}
        </Text>
        <Pressable
          style={styles.successButton}
          onPress={() => router.replace(visitCompleted ? `/(app)/work-orders/${id}` : `/(app)/work-orders/${id}/closure`)}
        >
          <Text style={styles.successButtonText}>{visitCompleted ? 'Back to notification' : 'Continue to closure'}</Text>
        </Pressable>
      </View>
    );
  }

  if (savedOffline) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Job Form', headerTintColor: '#7D1D3F', headerBackVisible: false }} />
        <Text style={styles.successTitle}>Saved offline</Text>
        <Text style={styles.successBody}>Your submission is queued and will sync automatically when you&apos;re back online.</Text>
        <Pressable style={styles.successButton} onPress={() => router.replace('/(app)/(tabs)/dashboard')}>
          <Text style={styles.successButtonText}>Back to dashboard</Text>
        </Pressable>
      </View>
    );
  }

  const submitting = submitJobForm.isPending;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: workOrder.wo_number, headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.jobTypeBadgeText}>{JOB_TYPE_LABELS[workOrder.job_type] || workOrder.job_type}</Text>
          {workOrder.serial_numbers.length > 0 && (
            <Text style={styles.summarySerials}>Transformer: {workOrder.serial_numbers.join(', ')}</Text>
          )}
        </View>

        {!form ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No form available for this job type yet.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.formName}>{form.name}</Text>
            {form.sections.map(section => {
              if (section.fields.length === 0 && section.tables.length === 0) return null;
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{section.title}</Text>
                  </View>
                  <View style={styles.sectionBody}>
                    {section.fields.map((field, fi) => (
                      <FormFieldRow
                        key={field.id}
                        field={field}
                        value={fieldValues[field.id] || ''}
                        onChange={setField}
                        bordered={fi > 0}
                        isIncomplete={incompleteIds.has(field.id)}
                      />
                    ))}
                    {section.tables.map((table, ti) => (
                      <View key={table.id} style={(ti > 0 || section.fields.length > 0) ? styles.tableBordered : undefined}>
                        <TableSection
                          table={table}
                          rowValues={rowValues}
                          setRowStatus={setRowStatus}
                          setRowRemarks={setRowRemarks}
                          incompleteIds={incompleteIds}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {!!form && (
        <View style={styles.footer}>
          {!!submitError && <Text style={styles.footerError}>{submitError}</Text>}
          <Pressable style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit form</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6', padding: 32 },
  errorText: { color: '#DC2626', fontSize: 13 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#1C0D14', marginBottom: 8, textAlign: 'center' },
  successBody: { fontSize: 13, color: '#7A6870', textAlign: 'center', marginBottom: 28, lineHeight: 19 },
  successButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  successButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 110 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E5E0E3' },
  jobTypeBadgeText: { alignSelf: 'flex-start', backgroundColor: '#F9EEF2', color: '#7D1D3F', fontSize: 11, fontWeight: '500', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  summarySerials: { fontSize: 11, color: '#7A6870', marginTop: 8 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E5E0E3' },
  emptyText: { fontSize: 13, color: '#7A6870' },
  formName: { fontSize: 13, fontWeight: '600', color: '#1C0D14', marginBottom: 12 },
  section: { marginBottom: 16 },
  sectionHeader: { backgroundColor: '#7D1D3F', borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sectionHeaderText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionBody: { backgroundColor: '#fff', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderTopWidth: 0, borderColor: '#E5E0E3', overflow: 'hidden' },
  tableBordered: { borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 14 },
  footerError: { fontSize: 12, color: '#DC2626', textAlign: 'center', marginBottom: 8 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
