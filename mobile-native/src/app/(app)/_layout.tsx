import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/AuthContext';
import NativeLocationGate from '@/components/NativeLocationGate';

// Client-side equivalent of the PWA's per-page auth checks — there's no RN middleware,
// so every screen under (app) is gated here once instead of individually. Order
// matters: session check first, then must-change-password (mirrors
// requireMobilePasswordChanged in the Next.js backend), then the location gate
// (mirrors components/mobile/LocationGate.tsx — blocks the app behind a permission
// prompt, but never on top of an unauthenticated or must-change-password state).
export default function AppLayout() {
  const { session, loading, mustChangePassword } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (mustChangePassword) return <Redirect href="/change-password" />;

  return (
    <NativeLocationGate>
      {/* No per-route name declarations here — each work-order screen configures its
          own header via a child <Stack.Screen options={...}/> instead (see
          work-orders/[id]/index.tsx, checkin.tsx, closure.tsx), since that pattern
          doesn't depend on knowing the exact internal route-name string Expo Router
          assigns to a folder+index.tsx route (undocumented enough to not guess at). */}
      <Stack screenOptions={{ headerShown: false }} />
    </NativeLocationGate>
  );
}
