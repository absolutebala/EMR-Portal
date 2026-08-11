import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { apiPost } from './api';
import type { CheckInVariables, ClosureVariables, ErrorResponse } from './types';

// Offline-first mutation queue: react-query automatically pauses a mutation instead
// of failing it when onlineManager reports offline (default networkMode: 'online' on
// every query/mutation), and retries it once onlineManager flips back to online — this
// replaces the PWA's hand-rolled localStorage + `online` event + service-worker
// postMessage queue (see lib/mobile/backgroundCheckIn.ts and FormFillView.tsx's
// pending-submissions queue in the Next.js repo) with a maintained library doing the
// same job. Reused unmodified by every screen with a write (checkin, closure, and
// later the form submit, product requests, expenses) — build this once, here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 2 },
  },
});

onlineManager.setEventListener(setOnline => {
  return NetInfo.addEventListener(state => {
    setOnline(!!state.isConnected);
  });
});

// react-query's own "refetch on window focus" concept, mapped to the app coming to
// the foreground instead of a browser tab gaining focus — also what re-triggers any
// paused mutations to retry alongside the online-state listener above.
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}
AppState.addEventListener('change', onAppStateChange);

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'EMR_RQ_CACHE',
});

// Registered once here (not just passed inline to useMutation in each screen) so a
// mutation that was queued offline, persisted to AsyncStorage, and then rehydrated
// after the app was fully closed and reopened still has a real mutationFn to resume
// with — a bare closure passed to useMutation can't survive serialization, but a
// mutationKey can, and react-query looks up these defaults by key on restore.
export const CHECKIN_MUTATION_KEY = ['submit-checkin'];
export const CLOSURE_MUTATION_KEY = ['submit-closure'];

queryClient.setMutationDefaults(CHECKIN_MUTATION_KEY, {
  mutationFn: (variables: CheckInVariables) =>
    apiPost<ErrorResponse>(`/api/mobile/v1/work-orders/${variables.workOrderId}/checkin`, variables),
});

queryClient.setMutationDefaults(CLOSURE_MUTATION_KEY, {
  mutationFn: (variables: ClosureVariables) =>
    apiPost<ErrorResponse>(`/api/mobile/v1/work-orders/${variables.workOrderId}/closure`, variables),
});
