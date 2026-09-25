import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, type Href } from 'expo-router';
import { translateLinkPath } from '@/lib/pushNotifications';
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

  // Tapping a notification takes the engineer straight to that item (its linkPath),
  // rather than a generic OK that dropped them on the dashboard.
  function openItem(n: NotificationView) {
    setVisible(false);
    router.push(translateLinkPath(n.linkPath) as Href);
  }

  const extraCount = Math.max(0, items.length - MAX_LISTED);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {items.length} new notification{items.length !== 1 ? 's' : ''}
            </Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Tap a notification to open it.</Text>
          <View style={styles.list}>
            {items.slice(0, MAX_LISTED).map(n => (
              <Pressable key={n.id} style={styles.item} onPress={() => openItem(n)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{n.title}</Text>
                  {!!n.body && <Text style={styles.itemBody} numberOfLines={2}>{n.body}</Text>}
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))}
            {extraCount > 0 && (
              <Pressable onPress={() => { setVisible(false); router.push('/(app)/(tabs)/alerts'); }}>
                <Text style={styles.more}>and {extraCount} more — view all →</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: '#1C0D14' },
  close: { fontSize: 16, color: '#9CA3AF', fontWeight: '600', paddingHorizontal: 4 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 2, marginBottom: 8 },
  list: { marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#1C0D14' },
  itemBody: { fontSize: 12, color: '#7A6870', marginTop: 2 },
  chev: { fontSize: 20, color: '#B9A9B0', fontWeight: '400' },
  more: { fontSize: 12, color: '#7D1D3F', marginTop: 10, fontWeight: '600' },
});
