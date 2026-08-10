import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { apiGet } from './api';
import type { AuthMeResponse } from './types';

interface AuthState {
  session: Session | null;
  loading: boolean;
  mustChangePassword: boolean;
  engineerName: string | null;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [engineerName, setEngineerName] = useState<string | null>(null);

  // GET /api/mobile/v1/auth/me — the RN equivalent of the PWA's server-side
  // requireMobilePasswordChanged() redirect gate (lib/mobile/authGuard.ts). RN has no
  // server-side redirect, so this comes back as a plain JSON flag and the app layout
  // (app/(app)/_layout.tsx) navigates to the change-password screen itself when set.
  const refreshMe = useCallback(async () => {
    try {
      const res = await apiGet<AuthMeResponse>('/api/mobile/v1/auth/me');
      setMustChangePassword(res.mustChangePassword);
      setEngineerName(res.engineer?.name ?? null);
    } catch {
      // best-effort — a transient failure here shouldn't block the app; the next
      // successful call (or a real 401, handled by api.ts's own sign-out path) will
      // correct it.
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) refreshMe();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (newSession) {
        refreshMe();
      } else {
        setMustChangePassword(false);
        setEngineerName(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, mustChangePassword, engineerName, refreshMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
