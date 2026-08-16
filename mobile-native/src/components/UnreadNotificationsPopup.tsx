import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAlerts } from '@/lib/hooks';
import { useAuth } from '@/lib/AuthContext';
import type { NotificationView } from '@/lib/types';

const MAX_LISTED = 5;
// Local-only "have I already popped this one up" tracking, separate from the server's
// read_at (which only flips once the engineer actually opens the alerts list) — this
// is what stops the same unread notifications from re-triggering the popup every time
// the app is foregrounded. Capped so it can't grow unbounded over the life of the app.
const SHOWN_IDS_KEY = 'emr_popup_shown_notification_ids';
const MAX_TRACKED_IDS = 300;

async function loadShownIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SHOWN_IDS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function markShown(ids: string[], alreadyShown: Set<string>): Promise<void> {
  const merged = [...alreadyShown, ...ids];
  const trimmed = merged.slice(Math.max(0, merged.length - MAX_TRACKED_IDS));
  try {
    await AsyncStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(trimmed));
  } catch {
    // best-effort only — worst case the popup re-shows something once more
  }
}

// Rendered once at the (app) root. Independent of push delivery — built entirely on
// the existing in-app alerts list, so it works even while push notifications are
// silently failing to reach the device (see lib/push.ts). Only shows notifications
// that haven't already been popped up before — reopening the app with nothing new
// since last time shows nothing at all.
export default function UnreadNotificationsPopup() {
  const { session } = useAuth();
  const router = useRouter();
  const { refetch } = useAlerts();
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const appState = useRef(AppState.currentState);

  async function checkForUnread() {
    const [result, shownIds] = await Promise.all([refetch(), loadShownIds()]);
    const unread = (result.data?.notifications ?? []).filter(n => !n.read);
    const unseen = unread.filter(n => !shownIds.has(n.id));
    if (unseen.length > 0) {
      setItems(unseen);
      setVisible(true);
      markShown(unseen.map(n => n.id), shownIds);
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
