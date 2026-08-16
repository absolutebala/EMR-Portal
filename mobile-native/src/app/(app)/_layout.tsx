import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/AuthContext';
import { useJobs } from '@/lib/hooks';
import { useAutoDownloadForms } from '@/lib/useFormDownloads';
import { useRegisterPushToken, useNotificationResponseListener } from '@/lib/pushNotifications';
import NativeLocationGate from '@/components/NativeLocationGate';
import PendingSyncBanner from '@/components/PendingSyncBanner';
import UnreadNotificationsPopup from '@/components/UnreadNotificationsPopup';
import ForegroundNotificationToast from '@/components/ForegroundNotificationToast';

// Client-side equivalent of the PWA's per-page auth checks — there's no RN middleware,
// so every screen under (app) is gated here once instead of individually. Order
// matters: session check first, then must-change-password (mirrors
// requireMobilePasswordChanged in the Next.js backend), then the location gate
// (mirrors components/mobile/LocationGate.tsx — blocks the app behind a permission
// prompt, but never on top of an unauthenticated or must-change-password state).
export default function AppLayout() {
  const { session, loading, mustChangePassword, signOut } = useAuth();

  // Cognito never issues tokens for a temp-password account until its
  // NEW_PASSWORD_REQUIRED login challenge is answered (see login.tsx/change-password.tsx)
  // — so if must_change_password is true for an *already* signed-in session (e.g. an
  // admin reset this user's password mid-session, per reset-user-password.ts's
  // AdminSetUserPasswordCommand(Permanent:false)), there's no challenge session to
  // complete here. Sign out and send them back through a fresh login with their new
  // temp password instead of trying to reuse a session that's about to be stale.
  useEffect(() => {
    if (mustChangePassword) signOut();
  }, [mustChangePassword, signOut]);

  // Mounted here (not inside the dashboard screen) so it keeps running regardless of
  // which tab is focused — Tabs unmounts inactive tab screens by default, which would
  // stop the download loop the moment the engineer navigates away from Dashboard.
  const { data: activeJobs } = useJobs('active');
  useAutoDownloadForms(activeJobs?.workOrders);
  useRegisterPushToken();
  useNotificationResponseListener();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  if (!session || mustChangePassword) return <Redirect href="/login" />;

  return (
    <NativeLocationGate>
      {/* No per-route name declarations here — each work-order screen configures its
          own header via a child <Stack.Screen options={...}/> instead (see
          work-orders/[id]/index.tsx, checkin.tsx, closure.tsx), since that pattern
          doesn't depend on knowing the exact internal route-name string Expo Router
          assigns to a folder+index.tsx route (undocumented enough to not guess at). */}
      <Stack screenOptions={{ headerShown: false }} />
      <PendingSyncBanner />
      <ForegroundNotificationToast />
      <UnreadNotificationsPopup />
    </NativeLocationGate>
  );
}
