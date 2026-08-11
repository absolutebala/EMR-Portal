import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useAlerts, useMarkAlertRead, useMarkAllAlertsRead } from '@/lib/hooks';
import { translateLinkPath } from '@/lib/pushNotifications';
import type { NotificationView } from '@/lib/types';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AlertsScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useAlerts();
  const markRead = useMarkAlertRead();
  const markAllRead = useMarkAllAlertsRead();

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount ?? 0;

  function handleSelect(n: NotificationView) {
    if (!n.read) markRead.mutate(n.id);
    if (n.linkPath) router.push(translateLinkPath(n.linkPath) as Href);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true, title: 'Alerts', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (unreadCount > 0 ? (
            <Pressable onPress={() => markAllRead.mutate()}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : null),
        }}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7D1D3F" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <AlertCard notification={item} onPress={() => handleSelect(item)} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{error || data?.error ? 'Failed to load alerts' : 'No alerts yet'}</Text>}
        />
      )}
    </View>
  );
}

function AlertCard({ notification, onPress }: { notification: NotificationView; onPress: () => void }) {
  return (
    <Pressable style={[styles.card, !notification.read && styles.cardUnread]} onPress={onPress}>
      {!notification.read && <View style={styles.dot} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, !notification.read && styles.titleUnread]}>{notification.title}</Text>
        {!!notification.body && <Text style={styles.body}>{notification.body}</Text>}
        <Text style={styles.time}>{relativeTime(notification.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 24 },
  empty: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  markAllText: { color: '#7D1D3F', fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  cardUnread: { backgroundColor: '#F9EEF2' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7D1D3F', marginTop: 5 },
  title: { fontSize: 12, fontWeight: '500', color: '#1C0D14' },
  titleUnread: { fontWeight: '600' },
  body: { fontSize: 11, color: '#7A6870', marginTop: 3 },
  time: { fontSize: 10, color: '#7A6870', marginTop: 4 },
});
