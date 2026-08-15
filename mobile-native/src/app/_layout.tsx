import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from '@/lib/AuthContext';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import { EMRSplashScreen } from '@/components/EMRSplashScreen';

// Keep the native (static) splash up until our custom animated one takes over —
// called at module scope per Expo's docs, not inside the component.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  // Hide the native splash as soon as JS has taken over, revealing our animated
  // overlay underneath — the rest of the tree (auth/query providers, navigator)
  // mounts immediately too, so data loading happens in parallel with the ~2s
  // animation instead of only starting once it finishes.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
      // Paused mutations (queued while offline) are persisted alongside query data,
      // but react-query does not auto-resume them after a cache rehydration on its
      // own — this is the documented hook for kicking that off once restore completes.
      onSuccess={() => {
        queryClient.resumePausedMutations();
      }}
    >
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
      {showSplash && (
        <View style={StyleSheet.absoluteFill}>
          <EMRSplashScreen onFinish={() => setShowSplash(false)} />
        </View>
      )}
    </PersistQueryClientProvider>
  );
}
