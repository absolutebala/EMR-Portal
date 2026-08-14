import { secureStoreAdapter } from './secureStoreAdapter';
import type { AuthenticationResult } from './cognito';

export interface SessionTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

const SESSION_KEY = 'emr_cognito_session';

type Listener = (tokens: SessionTokens | null) => void;
const listeners = new Set<Listener>();

// undefined = not yet loaded from SecureStore this process lifetime.
let current: SessionTokens | null | undefined;

// Hand-rolled pub/sub replacing supabase-js's onAuthStateChange — there's no
// equivalent built into a plain fetch-based Cognito client, and RN has no built-in
// 'events' module worth reaching for just for this.
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const l of listeners) l(current ?? null);
}

export async function loadSession(): Promise<SessionTokens | null> {
  if (current !== undefined) return current;
  const raw = await secureStoreAdapter.getItem(SESSION_KEY);
  current = raw ? (JSON.parse(raw) as SessionTokens) : null;
  return current;
}

export function fromAuthResult(auth: AuthenticationResult, fallbackRefreshToken?: string): SessionTokens {
  const refreshToken = auth.RefreshToken ?? fallbackRefreshToken;
  if (!refreshToken) throw new Error('No refresh token available');
  return { idToken: auth.IdToken, accessToken: auth.AccessToken, refreshToken };
}

export async function setSession(tokens: SessionTokens): Promise<void> {
  current = tokens;
  await secureStoreAdapter.setItem(SESSION_KEY, JSON.stringify(tokens));
  notify();
}

export async function clearSession(): Promise<void> {
  current = null;
  await secureStoreAdapter.removeItem(SESSION_KEY);
  notify();
}

export function getCurrentSession(): SessionTokens | null {
  return current ?? null;
}
