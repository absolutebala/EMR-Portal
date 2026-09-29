import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMyExpenseLogs } from '@/lib/hooks';
import { EXPENSE_STATUS_CFG } from '@/lib/constants';
import { apiPatch, apiDelete } from '@/lib/api';
import RNExpenseTypePicker from '@/components/RNExpenseTypePicker';
import type { ExpenseLogView } from '@/lib/types';

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ExpenseProjectDetailScreen() {
  const { workOrderId } = useLocalSearchParams<{ workOrderId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useMyExpenseLogs();

  const logs = useMemo(() => (data?.logs || []).filter(l => l.workOrderId === workOrderId), [data, workOrderId]);
  const total = logs.reduce((sum, l) => sum + l.amount, 0);
  const first = logs[0];

  const [editLog, setEditLog] = useState<ExpenseLogView | null>(null);
  const [typeId, setTypeId] = useState('');
  const [typeName, setTypeName] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [amount, setAmount] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  function openEdit(log: ExpenseLogView) {
    setEditError('');
    setTypeId(log.expenseTypeId); setTypeName(log.expenseTypeName);
    setDateStr(log.expenseDate); setAmount(String(log.amount));
    setEditLog(log);
  }

  async function saveEdit() {
    if (!editLog) return;
    const amt = Number(amount);
    if (!(amt > 0)) { setEditError('Enter a valid amount.'); return; }
    if (!typeId) { setEditError('Select an expense type.'); return; }
    setSaving(true); setEditError('');
    try {
      await apiPatch(`/api/mobile/v1/expense-logs/${editLog.id}`, { expenseTypeId: typeId, expenseDate: dateStr, amount: amt });
      qc.invalidateQueries({ queryKey: ['expense-logs'] });
      setEditLog(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  function askDelete(log: ExpenseLogView) {
    Alert.alert('Delete expense', `Delete this ${formatAmount(log.amount)} ${log.expenseTypeName} expense? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await apiDelete(`/api/mobile/v1/expense-logs/${log.id}`);
            qc.invalidateQueries({ queryKey: ['expense-logs'] });
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: first?.projectLabel || 'Project expenses', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7D1D3F" />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <LogCard log={item} onEdit={() => openEdit(item)} onDelete={() => askDelete(item)} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>{logs.length} log{logs.length !== 1 ? 's' : ''}</Text>
              <Text style={styles.totalValue}>{formatAmount(total)}</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>{error ? 'Failed to load expenses' : 'No expense logs for this project'}</Text>}
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.submitButton} onPress={() => router.push({ pathname: '/(app)/(tabs)/expenses/new', params: { wo: workOrderId } })}>
          <Text style={styles.submitText}>Add another expense</Text>
        </Pressable>
      </View>

      <Modal visible={!!editLog} transparent animationType="slide" onRequestClose={() => setEditLog(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit expense</Text>
            {!!editError && <Text style={styles.errorText}>{editError}</Text>}

            <Text style={styles.label}>Expense type</Text>
            <RNExpenseTypePicker valueId={typeId} valueName={typeName} onChange={(id, name) => { setTypeId(id); setTypeName(name); }} />

            <Text style={styles.label}>Date</Text>
            <Pressable style={styles.input} onPress={() => setShowDate(true)}>
              <Text style={styles.inputText}>{formatDate(dateStr)}</Text>
            </Pressable>
            {showDate && (
              <DateTimePicker value={new Date(`${dateStr}T00:00:00`)} mode="date" maximumDate={new Date()}
                onChange={(_e: DateTimePickerEvent, d?: Date) => { setShowDate(false); if (d) setDateStr(toIso(d)); }} />
            )}

            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />

            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setEditLog(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={saveEdit} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LogCard({ log, onEdit, onDelete }: { log: ExpenseLogView; onEdit: () => void; onDelete: () => void }) {
  const cfg = EXPENSE_STATUS_CFG[log.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View>
          <Text style={styles.cardTitle}>{log.expenseTypeName}</Text>
          <Text style={styles.cardDate}>{formatDate(log.expenseDate)}</Text>
        </View>
        <Text style={styles.cardAmount}>{formatAmount(log.amount)}</Text>
      </View>
      <View style={styles.cardFooter}>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        {!!log.photoUrl && <Image source={{ uri: log.photoUrl }} style={styles.receiptThumb} />}
      </View>
      <ReviewerLine log={log} />
      {log.status === 'pending' && (
        <View style={styles.actionsRow}>
          <Pressable style={styles.editBtn} onPress={onEdit}><Text style={styles.editText}>Edit</Text></Pressable>
          <Pressable style={styles.deleteBtn} onPress={onDelete}><Text style={styles.deleteText}>Delete</Text></Pressable>
        </View>
      )}
    </View>
  );
}

// status === 'rejected' can happen at either approval stage, but reviewed_by/reviewed_at
// always records whoever made that final call either way, so a single "Rejected by" line
// covers both. 'approved' likewise always means the second-stage (final) approver.
// 'manager_approved' is the one case with no reviewedByName yet — first-level approval
// only, shown as its own message so it's not confused with a final decision.
function ReviewerLine({ log }: { log: ExpenseLogView }) {
  if (log.status === 'rejected' && log.reviewedByName) {
    return <Text style={styles.reviewerText}>Rejected by {log.reviewedByName}{log.reviewedAt ? ` · ${formatDate(log.reviewedAt)}` : ''}</Text>;
  }
  if (log.status === 'approved' && log.reviewedByName) {
    return <Text style={styles.reviewerText}>Approved by {log.reviewedByName}{log.reviewedAt ? ` · ${formatDate(log.reviewedAt)}` : ''}</Text>;
  }
  if (log.status === 'manager_approved' && log.managerApprovedByName) {
    return <Text style={styles.reviewerText}>First approved by {log.managerApprovedByName} · awaiting final approval</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  totalBox: {
    backgroundColor: '#F9EEF2', borderWidth: 1, borderColor: '#E8C5D0', borderRadius: 11, padding: 13,
    marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontSize: 12, fontWeight: '500', color: '#7D1D3F' },
  totalValue: { fontSize: 15, fontWeight: '700', color: '#7D1D3F' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, shadowColor: '#7D1D3F', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  cardDate: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  cardAmount: { fontSize: 14, fontWeight: '700', color: '#1C0D14' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '600' },
  receiptThumb: { width: 34, height: 34, borderRadius: 6, borderWidth: 1, borderColor: '#E5E0E3' },
  reviewerText: { fontSize: 10, color: '#7A6870', marginTop: 6 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: '#F2EBEE', paddingTop: 10 },
  editBtn: { flex: 1, borderWidth: 1, borderColor: '#E5E0E3', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  editText: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  deleteBtn: { flex: 1, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  deleteText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 16 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 30 },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: '#1C0D14', marginBottom: 12 },
  errorText: { backgroundColor: '#FEE2E2', color: '#DC2626', borderRadius: 9, padding: 10, fontSize: 12, marginBottom: 10, overflow: 'hidden' },
  label: { fontSize: 11, fontWeight: '600', color: '#7A6870', marginBottom: 5, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#1C0D14', backgroundColor: '#fff' },
  inputText: { fontSize: 14, color: '#1C0D14' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#E5E0E3', borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#1C0D14' },
  saveBtn: { flex: 1, backgroundColor: '#7D1D3F', borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
