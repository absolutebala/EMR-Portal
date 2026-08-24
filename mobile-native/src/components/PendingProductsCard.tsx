import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useMarkProductReceived } from '@/lib/hooks';
import type { PendingProductItem } from '@/lib/types';

interface Props {
  items: PendingProductItem[];
}

// Stays visible on the dashboard from the moment an item is approved until it's
// delivered — a plain approval used to only show up in the Requests tab, easy to miss.
// 'dispatched' items get a "Mark Received" button (the one status change a field
// engineer can make themselves, confirming physical receipt); 'approved'-but-not-yet-
// dispatched items are informational only, since there's nothing to receive yet.
export default function PendingProductsCard({ items }: Props) {
  const router = useRouter();
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Product Requests</Text>
      {items.map(item => (
        <ProductRow key={item.id} item={item} onOpenJob={() => router.push(`/(app)/(tabs)/work-orders/${item.workOrderId}`)} />
      ))}
    </View>
  );
}

function ProductRow({ item, onOpenJob }: { item: PendingProductItem; onOpenJob: () => void }) {
  const mutation = useMarkProductReceived();
  const isDispatched = item.status === 'dispatched';

  return (
    <View style={styles.row}>
      <Pressable style={styles.rowInfo} onPress={onOpenJob}>
        <Text style={styles.productName} numberOfLines={1}>{item.productName} × {item.quantity}</Text>
        <Text style={styles.meta}>{item.woNumber}</Text>
      </Pressable>
      {isDispatched ? (
        <Pressable
          style={[styles.receiveButton, mutation.isPending && styles.receiveButtonDisabled]}
          disabled={mutation.isPending}
          onPress={() => mutation.mutate(item.id)}
        >
          {mutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.receiveButtonText}>Mark Received</Text>}
        </Pressable>
      ) : (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Approved</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  title: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  row: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#7D1D3F', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  productName: { fontSize: 12.5, fontWeight: '600', color: '#1C0D14' },
  meta: { fontSize: 10.5, color: '#7A6870', marginTop: 2 },
  receiveButton: { backgroundColor: '#7D1D3F', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0 },
  receiveButtonDisabled: { opacity: 0.7 },
  receiveButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  badge: { backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  badgeText: { color: '#1E40AF', fontSize: 10.5, fontWeight: '600' },
});
