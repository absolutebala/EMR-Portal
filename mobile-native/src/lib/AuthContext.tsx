import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { loadSession, onSessionChange, type SessionTokens } from './sessionStore';
import { logout as logoutAction } from './auth';
import { apiGet } from './api';
import type { AuthMeResponse } from './types';

const MOBILE_ONLY_MESSAGE = 'This mobile app is only for Field Engineers. Please access the application from your computer: https://portal.emr.global/login';
const SIGNED_IN_ELSEWHERE_MESSAGE = 'You were signed out because your account was used to sign in on another device. Only one device can be signed in at a time.';

interface AuthState {
  session: SessionTokens | null;
  loading: boolean;
  mustChangePassword: boolean;
  engineerName: string | null;
  userId: string | null;
  accessDenied: string | null;
  refreshMe: () => Promise<{ accessDenied: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionTokens | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [engineerName, setEngineerName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  // GET /api/mobile/v1/auth/me — the RN equivalent of the PWA's server-side
  // requireMobilePasswordChanged() redirect gate (lib/mobile/authGuard.ts). RN has no
  // server-side redirect, so this comes back as a plain JSON flag and the app layout
  // (app/(app)/_layout.tsx) navigates to the change-password screen itself when set.
  //
  // Also the single enforcement point for "RN app is Field-Engineer-only" — covers
  // every path a session can appear through (fresh login, challenge completion, app
  // resume with an already-stored session) rather than duplicating the check in each
  // screen. Returns the result (not just state) so login.tsx/change-password.tsx can
  // react to it immediately instead of reading a not-yet-updated context value right
  // after awaiting this.
  const refreshMe = useCallback(async (): Promise<{ accessDenied: string | null }> => {
    try {
      const res = await apiGet<AuthMeResponse>('/api/mobile/v1/auth/me');
      // Single-device: a newer login on another device superseded this one. Checked
      // before the role check so the displaced engineer sees the precise reason rather
      // than the generic Field-Engineer-only message (older builds, which lack this
      // field, fall through to the role check below and sign out there anyway).
      if (res.sessionSuperseded) {
        await logoutAction();
        setAccessDenied(SIGNED_IN_ELSEWHERE_MESSAGE);
        return { accessDenied: SIGNED_IN_ELSEWHERE_MESSAGE };
      }
      if (res.role && res.role !== 'Field Engineer') {
        await logoutAction();
        setAccessDenied(MOBILE_ONLY_MESSAGE);
        return { accessDenied: MOBILE_ONLY_MESSAGE };
      }
      setAccessDenied(null);
      setMustChangePassword(res.mustChangePassword);
      setEngineerName(res.engineer?.name ?? null);
      setUserId(res.userId ?? null);
      return { accessDenied: null };
    } catch {
      // best-effort — a transient failure here shouldn't block the app; the next
      // successful call (or a real 401, handled by api.ts's own sign-out path) will
      // correct it.
      return { accessDenied: null };
    }
  }, []);

  useEffect(() => {
    loadSession().then(initial => {
      setSessionState(initial);
      setLoading(false);
      if (initial) refreshMe();
    });

    const unsubscribe = onSessionChange(newSession => {
      setSessionState(newSession);
      setLoading(false);
      if (newSession) {
        refreshMe();
      } else {
        setMustChangePassword(false);
        setEngineerName(null);
        setUserId(null);
      }
    });

    return unsubscribe;
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    await logoutAction();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, mustChangePassword, engineerName, userId, accessDenied, refreshMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
