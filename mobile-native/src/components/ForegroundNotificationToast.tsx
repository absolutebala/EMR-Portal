import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useForegroundNotificationToast, translateLinkPath } from '@/lib/pushNotifications';

const AUTO_DISMISS_MS = 4000;

// Rendered once at the (app) root, alongside PendingSyncBanner/UnreadNotificationsPopup.
// Only ever has something to show once push delivery itself works (see lib/push.ts and
// the Firebase/FCM setup notes) — the OS banner still fires independently either way,
// this is the extra in-app surface for while the engineer is actively using the app.
export default function ForegroundNotificationToast() {
  const { toast, dismiss } = useForegroundNotificationToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => dismiss());
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!toast) return null;

  function handlePress() {
    dismiss();
    router.push(translateLinkPath(toast!.url) as Href);
  }

  return (
    <Animated.View style={[styles.container, { top: insets.top + 8, opacity }]}>
      <Pressable style={styles.toast} onPress={handlePress}>
        <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
        {!!toast.body && <Text style={styles.body} numberOfLines={2}>{toast.body}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 12, right: 12, zIndex: 60 },
  toast: { backgroundColor: '#1C0D14', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700' },
  body: { color: '#D6CDD2', fontSize: 12, marginTop: 2 },
});
