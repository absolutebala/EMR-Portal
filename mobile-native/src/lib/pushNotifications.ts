import { useEffect, useRef, useState } from 'react';
import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { apiPost } from './api';
import { useAuth } from './AuthContext';

// Foreground handler — without this, a push that arrives while the app is open and
// visible is silently swallowed (no banner, no sound) on both platforms. Must be
// called once at module load, not inside a component/effect.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators/emulators have no push capability

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Expo's push service requires the EAS project id to route a token — sourced from
  // app.json/eas.json once the project is linked (see eas.json). Not being linked yet
  // is a real, expected state before the Phase 5 EAS setup lands — degrade silently
  // (no push token, no crash) rather than throwing.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

// Registers/refreshes this device's Expo push token with the backend whenever a
// session is present — mounted once in (app)/_layout.tsx (not per-screen), same
// placement rationale as useAutoDownloadForms (Tabs unmounts inactive tab screens,
// which would drop a per-screen effect the moment the engineer switches tabs).
export function useRegisterPushToken() {
  const { session } = useAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (!session || registered.current) return;
    registered.current = true;
    getExpoPushToken().then(token => {
      if (!token) return;
      apiPost('/api/mobile/v1/push-tokens', {
        token,
        platform: Platform.OS,
        deviceName: Device.deviceName ?? Application.applicationName ?? null,
      }).catch(() => {});
    });
  }, [session]);
}

// The backend's notifyUsers() (shared with the PWA) writes PWA-shaped paths into
// linkPath (e.g. `/mobile/work-orders/<id>`, `/mobile/expenses`) since that's what
// sendPushToUser's Web Push payload and the in-app Alerts list both need — RN's route
// tree is shaped differently, so a tapped push needs its own translation rather than
// reusing the raw path directly.
export function translateLinkPath(linkPath: string | null | undefined): string {
  if (!linkPath) return '/(app)/(tabs)/alerts';

  const woMatch = linkPath.match(/^\/mobile\/work-orders\/([^/]+)/);
  if (woMatch) return `/(app)/(tabs)/work-orders/${woMatch[1]}`;

  if (linkPath.startsWith('/mobile/expenses')) return '/(app)/(tabs)/expenses';
  if (linkPath.startsWith('/mobile/requests')) return '/(app)/(tabs)/requests';
  if (linkPath.startsWith('/mobile/jobs')) return '/(app)/(tabs)/jobs';
  if (linkPath.startsWith('/mobile/dashboard')) return '/(app)/(tabs)/dashboard';

  // Desktop-only paths (e.g. '/expenses', sent to Super Admin/Head of Service) have
  // no RN equivalent — fall back to Alerts rather than navigating somewhere wrong.
  return '/(app)/(tabs)/alerts';
}

// Handles the "tap a push notification" case — both the cold-start case (app was
// fully closed) and the already-running case, via the same listener (Expo Notifications
// re-delivers the launch notification's response through this listener on startup).
export function useNotificationResponseListener() {
  const router = useRouter();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url as string | undefined;
      // External links (e.g. a Play Store update prompt) open in the browser/store,
      // not the in-app router which only understands our own deep-link paths.
      if (url && /^https?:\/\//i.test(url)) {
        Linking.openURL(url).catch(() => {});
        return;
      }
      router.push(translateLinkPath(url) as Href);
    });
    return () => sub.remove();
  }, [router]);
}

export interface ForegroundToastData {
  title: string;
  body: string | null;
  url: string | null;
}

// Handles the "a push arrives while the app is already open" case — distinct from
// the response listener above, which only fires on tap. The OS banner set up via
// setNotificationHandler at the top of this file still shows too; this additionally
// surfaces an in-app toast so it's visible even if the OS banner is missed/dismissed.
export function useForegroundNotificationToast() {
  const [toast, setToast] = useState<ForegroundToastData | null>(null);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const content = notification.request.content;
      setToast({
        title: content.title || 'New notification',
        body: content.body ?? null,
        url: (content.data?.url as string | undefined) ?? null,
      });
    });
    return () => sub.remove();
  }, []);

  return { toast, dismiss: () => setToast(null) };
}
