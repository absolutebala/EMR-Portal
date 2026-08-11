import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMyExpenseLogs } from '@/lib/hooks';
import { EXPENSE_STATUS_CFG } from '@/lib/constants';
import type { ExpenseLogView } from '@/lib/types';

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ExpenseProjectDetailScreen() {
  const { workOrderId } = useLocalSearchParams<{ workOrderId: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useMyExpenseLogs();

  const logs = useMemo(() => (data?.logs || []).filter(l => l.workOrderId === workOrderId), [data, workOrderId]);
  const total = logs.reduce((sum, l) => sum + l.amount, 0);
  const first = logs[0];

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
          renderItem={({ item }) => <LogCard log={item} />}
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
        <Pressable style={styles.submitButton} onPress={() => router.push({ pathname: '/(app)/expenses/new', params: { wo: workOrderId } })}>
          <Text style={styles.submitText}>Add another expense</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LogCard({ log }: { log: ExpenseLogView }) {
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
    </View>
  );
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
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 16 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
