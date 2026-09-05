import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyProductRequests } from '@/lib/hooks';
import { PRODUCT_REQUEST_STATUS_CFG } from '@/lib/constants';
import AppVersionFooter from '@/components/AppVersionFooter';
import type { ProductRequestView } from '@/lib/types';

type TabId = 'all' | 'pending' | 'approved' | 'dispatched' | 'delivered' | 'rejected';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'rejected', label: 'Rejected' },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useMyProductRequests();
  const [tab, setTab] = useState<TabId>('all');

  const filtered = useMemo(() => {
    const requests = data?.requests || [];
    if (tab === 'all') return requests;
    return requests
      .map(r => ({ ...r, items: r.items.filter(i => i.status === tab) }))
      .filter(r => r.items.length > 0);
  }, [data, tab]);

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Product Requests</Text>
        <Pressable style={styles.newButton} onPress={() => router.push('/(app)/(tabs)/requests/new')}>
          <Text style={styles.newButtonText}>+ New request</Text>
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map(t => (
          <Pressable key={t.id} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id)}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7D1D3F" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <RequestCard request={item} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{error || data?.error ? 'Failed to load requests' : 'No requests yet'}</Text>}
          ListFooterComponent={<AppVersionFooter />}
        />
      )}
    </View>
  );
}

function RequestCard({ request }: { request: ProductRequestView }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{request.woNumber}</Text>
      <Text style={styles.cardDate}>{formatDate(request.createdAt)}</Text>
      {request.items.map(item => {
        const cfg = PRODUCT_REQUEST_STATUS_CFG[item.status];
        return (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemText}>{item.productName} × {item.quantity}</Text>
            <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  headerArea: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#F8F5F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1C0D14' },
  newButton: { backgroundColor: '#7D1D3F', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  newButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#7D1D3F' },
  tabText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, shadowColor: '#7D1D3F', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  cardDate: { fontSize: 10, color: '#7A6870', marginBottom: 8, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 5 },
  itemText: { fontSize: 12, color: '#1C0D14' },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '600' },
});
