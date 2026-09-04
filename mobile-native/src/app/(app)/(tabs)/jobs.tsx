import { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useJobs } from '@/lib/hooks';
import JobCard from '@/components/JobCard';
import type { MobileWorkOrder } from '@/lib/types';

type TabId = 'all' | 'assigned' | 'in_progress' | 'needs_reassignment' | 'completed';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'needs_reassignment', label: 'Need Reassign' },
  { id: 'completed', label: 'Completed' },
];

export default function JobsScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useJobs('all');
  const [tab, setTab] = useState<TabId>('all');
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = useMemo(() => {
    let list = data?.workOrders || [];
    if (tab !== 'all') list = list.filter((w: MobileWorkOrder) => w.status === tab);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (w: MobileWorkOrder) =>
          w.wo_number.toLowerCase().includes(q) ||
          w.customer_name.toLowerCase().includes(q) ||
          w.serial_numbers.some(sn => sn.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data, tab, query]);

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          <Pressable style={styles.newButton} onPress={() => router.push('/(app)/(tabs)/notifications/new')}>
            <Text style={styles.newButtonText}>＋ New Notification</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          placeholder="Search by ID, customer, serial…"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.tabsRow}>
          {TABS.map(t => (
            <Pressable key={t.id} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7D1D3F" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <JobCard wo={item} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{error ? 'Failed to load jobs' : 'No jobs found'}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#F9FAFB' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#1C0D14' },
  newButton: { backgroundColor: '#7D1D3F', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  newButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  search: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 13, color: '#111827', backgroundColor: '#fff', marginBottom: 10,
  },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#7D1D3F' },
  tabText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
});
