import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyExpenseLogs, useSendExpenseReminder } from '@/lib/hooks';
import AppVersionFooter from '@/components/AppVersionFooter';
import type { ExpenseLogView } from '@/lib/types';

interface ProjectGroup {
  workOrderId: string;
  woNumber: string;
  projectLabel: string;
  customerName: string;
  total: number;
  count: number;
  pendingCount: number;
}

type StatusFilter = 'approved' | 'pending' | 'rejected' | null;

const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function inBucket(log: ExpenseLogView, filter: StatusFilter): boolean {
  if (filter === 'pending') return log.status === 'pending' || log.status === 'manager_approved';
  if (filter === 'approved') return log.status === 'approved';
  if (filter === 'rejected') return log.status === 'rejected';
  return true;
}

export default function ExpensesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useMyExpenseLogs();
  const reminderMutation = useSendExpenseReminder();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const logs = useMemo(() => data?.logs || [], [data]);

  const counts = useMemo(() => ({
    approved: logs.filter(l => l.status === 'approved').length,
    pending: logs.filter(l => l.status === 'pending' || l.status === 'manager_approved').length,
    rejected: logs.filter(l => l.status === 'rejected').length,
  }), [logs]);

  const filteredLogs = useMemo(() => logs.filter(l => inBucket(l, statusFilter)), [logs, statusFilter]);

  const projects = useMemo(() => {
    const map: Record<string, ProjectGroup> = {};
    for (const log of filteredLogs) {
      if (!map[log.workOrderId]) {
        map[log.workOrderId] = {
          workOrderId: log.workOrderId, woNumber: log.woNumber, projectLabel: log.projectLabel,
          customerName: log.customerName, total: 0, count: 0, pendingCount: 0,
        };
      }
      map[log.workOrderId].total += log.amount;
      map[log.workOrderId].count += 1;
      if (log.status === 'pending' || log.status === 'manager_approved') map[log.workOrderId].pendingCount += 1;
    }
    return Object.values(map).sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
  }, [filteredLogs]);

  const grandTotal = filteredLogs.reduce((sum, l) => sum + l.amount, 0);

  const reminderSentAt = data?.reminderSentAt;
  const cooldownRemainingMs = reminderSentAt ? REMINDER_COOLDOWN_MS - (Date.now() - new Date(reminderSentAt).getTime()) : 0;
  const onCooldown = cooldownRemainingMs > 0;
  const cooldownMinutes = Math.ceil(cooldownRemainingMs / 60000);

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Expenses</Text>
        <Pressable style={styles.newButton} onPress={() => router.push('/(app)/(tabs)/expenses/new')}>
          <Text style={styles.newButtonText}>+ Add expense</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard label="Approved" count={counts.approved} color="#059669" bg="#D1FAE5" active={statusFilter === 'approved'} onPress={() => setStatusFilter(f => f === 'approved' ? null : 'approved')} />
        <SummaryCard label="Pending" count={counts.pending} color="#92400E" bg="#FEF3C7" active={statusFilter === 'pending'} onPress={() => setStatusFilter(f => f === 'pending' ? null : 'pending')} />
        <SummaryCard label="Rejected" count={counts.rejected} color="#DC2626" bg="#FEE2E2" active={statusFilter === 'rejected'} onPress={() => setStatusFilter(f => f === 'rejected' ? null : 'rejected')} />
      </View>

      {statusFilter === 'pending' && counts.pending > 0 && (
        <View style={styles.reminderBox}>
          <Text style={styles.reminderText}>
            {counts.pending} expense{counts.pending !== 1 ? 's' : ''} awaiting approval
          </Text>
          <Pressable
            style={[styles.reminderButton, (onCooldown || reminderMutation.isPending) && styles.reminderButtonDisabled]}
            disabled={onCooldown || reminderMutation.isPending}
            onPress={() => reminderMutation.mutate()}
          >
            <Text style={styles.reminderButtonText}>
              {reminderMutation.isPending ? 'Sending…' : onCooldown ? `Reminded (${cooldownMinutes}m)` : 'Send Reminder'}
            </Text>
          </Pressable>
        </View>
      )}
      {reminderMutation.isError && (
        <Text style={styles.reminderError}>{reminderMutation.error.message}</Text>
      )}
      {reminderMutation.isSuccess && !reminderMutation.isError && (
        <Text style={styles.reminderSuccess}>Reminder sent to Service Manager &amp; Head of Service.</Text>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7D1D3F" />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={item => item.workOrderId}
          renderItem={({ item }) => <ProjectCard project={item} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            filteredLogs.length > 0 ? (
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>{statusFilter ? 'Filtered total' : 'Total logged'}</Text>
                <Text style={styles.totalValue}>{formatAmount(grandTotal)}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error || data?.error ? 'Failed to load expenses' : statusFilter ? 'No expenses in this status' : 'No expenses logged yet'}
            </Text>
          }
          ListFooterComponent={<AppVersionFooter />}
        />
      )}
    </View>
  );
}

function SummaryCard({ label, count, color, bg, active, onPress }: { label: string; count: number; color: string; bg: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.summaryCard, { backgroundColor: bg }, active && { borderColor: color, borderWidth: 2 }]} onPress={onPress}>
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function ProjectCard({ project }: { project: ProjectGroup }) {
  const router = useRouter();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/(app)/(tabs)/expenses/${project.workOrderId}`)}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle}>{project.projectLabel}</Text>
          <Text style={styles.cardMeta}>{project.woNumber} · {project.customerName}</Text>
          <Text style={styles.cardCount}>
            {project.count} log{project.count !== 1 ? 's' : ''}
            {project.pendingCount > 0 && <Text style={styles.pendingText}> · {project.pendingCount} pending</Text>}
          </Text>
        </View>
        <Text style={styles.cardTotal}>{formatAmount(project.total)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  headerArea: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#F8F5F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1C0D14' },
  newButton: { backgroundColor: '#7D1D3F', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  newButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  totalBox: {
    backgroundColor: '#F9EEF2', borderWidth: 1, borderColor: '#E8C5D0', borderRadius: 11, padding: 13,
    marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontSize: 12, fontWeight: '500', color: '#7D1D3F' },
  totalValue: { fontSize: 15, fontWeight: '700', color: '#7D1D3F' },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  summaryCard: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  summaryCount: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  reminderBox: {
    marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 10,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  reminderText: { fontSize: 12, fontWeight: '500', color: '#92400E', flex: 1 },
  reminderButton: { backgroundColor: '#7D1D3F', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  reminderButtonDisabled: { backgroundColor: '#B8B0B4' },
  reminderButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  reminderError: { fontSize: 11, color: '#DC2626', textAlign: 'center', marginBottom: 8, marginHorizontal: 16 },
  reminderSuccess: { fontSize: 11, color: '#059669', textAlign: 'center', marginBottom: 8, marginHorizontal: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, shadowColor: '#7D1D3F', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  cardMeta: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  cardCount: { fontSize: 10, color: '#7A6870', marginTop: 4 },
  pendingText: { color: '#92400E', fontWeight: '600' },
  cardTotal: { fontSize: 14, fontWeight: '700', color: '#7D1D3F', flexShrink: 0 },
});
