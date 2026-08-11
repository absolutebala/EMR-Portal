import { Stack } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from '@/lib/AuthContext';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';

export default function RootLayout() {
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
    </PersistQueryClientProvider>
  );
}
