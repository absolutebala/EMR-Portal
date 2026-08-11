import { useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyExpenseLogs } from '@/lib/hooks';

interface ProjectGroup {
  workOrderId: string;
  woNumber: string;
  projectLabel: string;
  customerName: string;
  total: number;
  count: number;
  pendingCount: number;
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpensesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useMyExpenseLogs();
  const logs = useMemo(() => data?.logs || [], [data]);

  const projects = useMemo(() => {
    const map: Record<string, ProjectGroup> = {};
    for (const log of logs) {
      if (!map[log.workOrderId]) {
        map[log.workOrderId] = {
          workOrderId: log.workOrderId, woNumber: log.woNumber, projectLabel: log.projectLabel,
          customerName: log.customerName, total: 0, count: 0, pendingCount: 0,
        };
      }
      map[log.workOrderId].total += log.amount;
      map[log.workOrderId].count += 1;
      if (log.status === 'pending') map[log.workOrderId].pendingCount += 1;
    }
    return Object.values(map).sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
  }, [logs]);

  const grandTotal = logs.reduce((sum, l) => sum + l.amount, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Expenses</Text>
        <Pressable style={styles.newButton} onPress={() => router.push('/(app)/expenses/new')}>
          <Text style={styles.newButtonText}>+ Add expense</Text>
        </Pressable>
      </View>

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
            logs.length > 0 ? (
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Total logged</Text>
                <Text style={styles.totalValue}>{formatAmount(grandTotal)}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>{error || data?.error ? 'Failed to load expenses' : 'No expenses logged yet'}</Text>}
        />
      )}
    </View>
  );
}

function ProjectCard({ project }: { project: ProjectGroup }) {
  const router = useRouter();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/(app)/expenses/${project.workOrderId}`)}>
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, shadowColor: '#7D1D3F', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  cardMeta: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  cardCount: { fontSize: 10, color: '#7A6870', marginTop: 4 },
  pendingText: { color: '#92400E', fontWeight: '600' },
  cardTotal: { fontSize: 14, fontWeight: '700', color: '#7D1D3F', flexShrink: 0 },
});
