import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { secureStoreAdapter } from './secureStoreAdapter';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// This client is used ONLY for auth (sign-in, session refresh, sign-out) — the app
// never queries Supabase tables directly. All data goes through the EMR Portal
// backend's bearer-token REST API (see api.ts), matching the existing web app's
// "app-layer server actions are the authorization boundary, RLS is defense in depth"
// model rather than relying on RLS to gate a native client's direct table access.
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js's autoRefreshToken timer only ticks while something is actively polling
// it — recommended pattern is to drive it off app foreground/background state so a
// token silently expires while backgrounded instead of refreshing just before use.
AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
