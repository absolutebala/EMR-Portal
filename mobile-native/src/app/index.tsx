import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/AuthContext';

// Root route — sends the user to the right place based on auth state. Mirrors the PWA
// mobile app's per-page auth check (no shared server-side guard exists there either;
// here it's a single client-side gate since there's no middleware equivalent in RN).
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  return <Redirect href="/(app)/(tabs)/dashboard" />;
}
