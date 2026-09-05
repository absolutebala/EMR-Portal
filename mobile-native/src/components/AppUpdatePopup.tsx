import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppUpdatePrompt } from '@/lib/types';

// Tracks the promptAt timestamp of the update prompt the engineer last dismissed, so a
// given prompt only pops up until they act on it — but a newer prompt (later promptAt)
// from the admin shows again.
const DISMISSED_KEY = 'emr_dismissed_update_prompt_at';

// Rendered once at the (app) root. The admin sets the message + Play Store link and pushes
// a prompt from Settings; the dashboard payload carries updatePrompt, and this shows the
// in-app popup with an "Update now" button that opens the store (the push is just the tray
// nudge to open the app).
export default function AppUpdatePopup({ prompt }: { prompt: AppUpdatePrompt | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!prompt) {
      setVisible(false);
      return;
    }
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(dismissedAt => {
        if (cancelled) return;
        // Show only if this prompt is newer than the one they last dismissed.
        setVisible(!dismissedAt || dismissedAt < prompt.promptAt);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
    // Re-evaluate only when the prompt's timestamp changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.promptAt]);

  if (!prompt) return null;

  async function dismiss() {
    if (prompt) {
      try {
        await AsyncStorage.setItem(DISMISSED_KEY, prompt.promptAt);
      } catch {
        // best-effort — worst case it re-shows once more
      }
    }
    setVisible(false);
  }

  async function handleUpdate() {
    if (prompt?.playStoreUrl) {
      Linking.openURL(prompt.playStoreUrl).catch(() => {});
    }
    await dismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.body}>{prompt.message}</Text>
          <View style={styles.row}>
            <Pressable style={styles.later} onPress={dismiss}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
            {!!prompt.playStoreUrl && (
              <Pressable style={styles.update} onPress={handleUpdate}>
                <Text style={styles.updateText}>Update now</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#1C0D14', marginBottom: 10 },
  body: { fontSize: 13, color: '#4A3A42', lineHeight: 19, marginBottom: 18 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  later: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10 },
  laterText: { color: '#7A6870', fontSize: 14, fontWeight: '600' },
  update: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center' },
  updateText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
