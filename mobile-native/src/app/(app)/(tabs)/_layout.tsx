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
        options={{ title: 'Jobs', tabBarIcon: ({ color }) => <TabIcon symbol="☰" color={color} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Requests', tabBarIcon: ({ color }) => <TabIcon symbol="▦" color={color} /> }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarIcon: ({ color }) => <TabIcon symbol="₹" color={color} /> }}
      />
    </Tabs>
  );
}

// Placeholder text-glyph icons — swap for a real icon set (e.g. @expo/vector-icons,
// already bundled with Expo) once the visual pass happens; not blocking for Phase 1.
function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}
