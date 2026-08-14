import * as cognito from './cognito';
import { loadSession, setSession, clearSession, fromAuthResult } from './sessionStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getAccessToken(): Promise<string | null> {
  const session = await loadSession();
  return session?.accessToken ?? null;
}

// Bearer-attaching fetch wrapper for the EMR Portal backend's /api/mobile/v1/* REST
// routes (see lib/mobile/apiAuth.ts's resolveBearerUser on the server side). A 401
// means the access token has expired or was rejected — try exactly one refresh +
// retry before giving up and clearing the session, which AuthContext's
// onSessionChange listener reacts to by routing back to the login screen. Callers
// never need to think about token refresh.
async function request<T>(path: string, init?: RequestInit, _isRetry = false): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401 && !_isRetry) {
    const session = await loadSession();
    try {
      if (!session?.refreshToken) throw new Error('no refresh token');
      const result = await cognito.refreshAuth(session.refreshToken);
      if (!result.AuthenticationResult) throw new Error('refresh failed');
      await setSession(fromAuthResult(result.AuthenticationResult, session.refreshToken));
      return request<T>(path, init, true);
    } catch {
      await clearSession();
      throw new ApiError('Session expired', 401);
    }
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no/invalid JSON body — fall through to the status-based error below
  }

  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined });
}
