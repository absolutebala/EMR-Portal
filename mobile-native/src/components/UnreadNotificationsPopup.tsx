import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAlerts } from '@/lib/hooks';
import { useAuth } from '@/lib/AuthContext';
import type { NotificationView } from '@/lib/types';

const MAX_LISTED = 5;

// Rendered once at the (app) root. Independent of push delivery — built entirely on
// the existing in-app alerts list, so it works even while push notifications are
// silently failing to reach the device (see lib/push.ts). Reappears every time the
// app is foregrounded while unread notifications exist — no "already shown" dedupe,
// by design (see plan notes) — simplest thing that matches what was asked for.
export default function UnreadNotificationsPopup() {
  const { session } = useAuth();
  const router = useRouter();
  const { refetch } = useAlerts();
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const appState = useRef(AppState.currentState);

  async function checkForUnread() {
    const result = await refetch();
    const unread = (result.data?.notifications ?? []).filter(n => !n.read);
    if (unread.length > 0) {
      setItems(unread);
      setVisible(true);
    }
  }

  useEffect(() => {
    if (!session) return;
    // Cold start / first mount after login counts as "opening the app" too.
    checkForUnread();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        checkForUnread();
      }
      appState.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function handleOk() {
    setVisible(false);
    router.push('/(app)/(tabs)/dashboard');
  }

  const extraCount = Math.max(0, items.length - MAX_LISTED);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.card}>
          <Text style={styles.title}>
            {items.length} new notification{items.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.list}>
            {items.slice(0, MAX_LISTED).map(n => (
              <View key={n.id} style={styles.item}>
                <Text style={styles.itemTitle} numberOfLines={1}>{n.title}</Text>
                {!!n.body && <Text style={styles.itemBody} numberOfLines={2}>{n.body}</Text>}
              </View>
            ))}
            {extraCount > 0 && (
              <Text style={styles.more}>and {extraCount} more…</Text>
            )}
          </View>
          <Pressable style={styles.button} onPress={handleOk}>
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#1C0D14', marginBottom: 12 },
  list: { marginBottom: 16 },
  item: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#1C0D14' },
  itemBody: { fontSize: 12, color: '#7A6870', marginTop: 2 },
  more: { fontSize: 12, color: '#7A6870', marginTop: 8, fontStyle: 'italic' },
  button: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
