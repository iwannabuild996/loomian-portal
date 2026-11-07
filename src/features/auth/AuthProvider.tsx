import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type Role = 'admin' | 'editor' | 'sales' | 'viewer';

/** Roles that can add and edit leads, tasks and meetings. Sales users only reach their own. */
export const canEditLeads = (role: Role | null) => role === 'admin' || role === 'editor' || role === 'sales';

type AuthState = {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRole(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('role, disabled')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        // A blocked user is signed out at once (their login is also banned in Supabase Auth).
        if (data?.disabled) {
          supabase.auth.signOut();
          return;
        }
        setRole((data?.role as Role) ?? 'viewer');
        setLoading(false);
      });
  }, [userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <AuthContext.Provider value={{ session, role, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
