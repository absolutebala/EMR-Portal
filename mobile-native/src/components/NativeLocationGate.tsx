import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, AppState, Linking } from 'react-native';
import * as Location from 'expo-location';

// RN port of components/mobile/LocationGate.tsx from the PWA. Only blocks on a real
// permission denial (PermissionStatus.DENIED) — never on "just no fix yet", which
// would wrongly lock out an engineer at a site with poor GPS signal. Unlike the web
// version (navigator.permissions.query can re-check silently), a native OS only shows
// its own permission dialog once per app install after a denial — a second denial
// requires the user to go into system Settings, so the "Try again" action here deep
// links there via Linking.openSettings() instead of re-prompting.
export default function NativeLocationGate({ children }: { children: ReactNode }) {
  // null = not resolved yet (first mount, before the initial permission check
  // completes) — deliberately not reset to null on subsequent re-checks (e.g. on
  // AppState becoming active again), so the gate doesn't flash back to a blank state
  // for an engineer who already has permission granted.
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null);
  // Android 12+ lets a user grant location while choosing only "Approximate"
  // (coarse) — attendance/check-in need real precision, so that's treated as its
  // own blocked state below, distinct from an outright denial. iOS doesn't surface
  // an equivalent flag in this response shape, so this stays null there and the
  // coarse-specific block never triggers on iOS.
  const [androidAccuracy, setAndroidAccuracy] = useState<'fine' | 'coarse' | 'none' | null>(null);

  // Written as an explicit .then() chain rather than async/await — the setState calls
  // only ever run inside a .then() callback (an external-system notification, per the
  // react-hooks/set-state-in-effect rule's own stated exception), never synchronously
  // within an effect body, which an async function invoked directly from an effect
  // does not satisfy even when its own setState calls come after an await.
  const check = useCallback(() => {
    Location.getForegroundPermissionsAsync().then(response => {
      if (response.status === Location.PermissionStatus.UNDETERMINED) {
        Location.requestForegroundPermissionsAsync().then(requested => {
          setStatus(requested.status);
          setAndroidAccuracy(requested.android?.accuracy ?? null);
        });
      } else {
        setStatus(response.status);
        setAndroidAccuracy(response.android?.accuracy ?? null);
      }
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  useEffect(() => {
    check();
  }, [check]);

  if (status === null) return null;

  if (status === Location.PermissionStatus.DENIED) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Location access is required</Text>
        <Text style={styles.body}>
          The EMR Field App needs your location for site check-ins and to show your current position to your
          supervisor. Please enable location access in Settings.
        </Text>
        <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </Pressable>
        <Pressable style={styles.retryButton} onPress={check}>
          <Text style={styles.retryText}>I&apos;ve enabled it — try again</Text>
        </Pressable>
      </View>
    );
  }

  if (status === Location.PermissionStatus.GRANTED && androidAccuracy === 'coarse') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Precise location is required</Text>
        <Text style={styles.body}>
          The EMR Field App needs your exact location for accurate site check-ins and attendance —
          &quot;Approximate&quot; location isn&apos;t enough. Please enable Precise location for this app in
          Settings.
        </Text>
        <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </Pressable>
        <Pressable style={styles.retryButton} onPress={check}>
          <Text style={styles.retryText}>I&apos;ve enabled it — try again</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff', gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  body: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  button: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  retryButton: { paddingVertical: 8 },
  retryText: { color: '#7D1D3F', fontSize: 13, fontWeight: '500' },
});
