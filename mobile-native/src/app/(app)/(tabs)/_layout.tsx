import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

// Standard (not the newer expo-router/unstable-native-tabs) — this renders on real
// native bottom-tab primitives already and is the documented-stable API; the
// unstable native-tabs API is worth revisiting once it's stable, but isn't worth the
// risk on the primary navigation shell this early.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7D1D3F',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ title: 'Notifications', tabBarIcon: ({ color }) => <TabIcon symbol="☰" color={color} /> }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Attendance', tabBarIcon: ({ color }) => <TabIcon symbol="✓" color={color} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Requests', tabBarIcon: ({ color }) => <TabIcon symbol="▦" color={color} /> }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarIcon: ({ color }) => <TabIcon symbol="₹" color={color} /> }}
      />

      {/* Every other screen under (tabs) — job detail, department jobs, alerts,
          profile, etc. — needs to live in this same directory so the bottom bar
          stays mounted underneath it when pushed (that's the whole point of moving
          them here). `href: null` is Expo Router's documented way to keep a route
          part of the Tabs navigator without it also claiming a tab bar button —
          without this, each of these would silently render as an extra, unstyled
          tab icon alongside the five real ones above. */}
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="account-password" options={{ href: null }} />
      <Tabs.Screen name="my-analytics" options={{ href: null }} />
      <Tabs.Screen name="department-jobs/[dept]" options={{ href: null }} />
      <Tabs.Screen name="requests/new" options={{ href: null }} />
      <Tabs.Screen name="notifications/new" options={{ href: null }} />
      <Tabs.Screen name="expenses/new" options={{ href: null }} />
      <Tabs.Screen name="expenses/[workOrderId]" options={{ href: null }} />
      <Tabs.Screen name="work-orders/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="work-orders/[id]/checkin" options={{ href: null }} />
      <Tabs.Screen name="work-orders/[id]/closure" options={{ href: null }} />
      <Tabs.Screen name="work-orders/[id]/form" options={{ href: null }} />
    </Tabs>
  );
}

// Placeholder text-glyph icons — swap for a real icon set (e.g. @expo/vector-icons,
// already bundled with Expo) once the visual pass happens; not blocking for Phase 1.
function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}
