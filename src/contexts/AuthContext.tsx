import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/local/client';
import type { User, Session } from '@/integrations/local/client';
import { AppRole, UserProfile, AuthUser, isDevLevel } from '@/types/auth';
import { getIpAddress } from '@/hooks/useIpAddress';

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  realRole: AppRole | null;
  viewAsRole: AppRole | null;
  setViewAsRole: (role: AppRole | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const VIEW_AS_KEY = 'viewAsRole';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [userDataFetched, setUserDataFetched] = useState(false);
  const [viewAsRole, setViewAsRoleState] = useState<AppRole | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(VIEW_AS_KEY);
    return (stored as AppRole) || null;
  });
  const lastFetchedUserIdRef = useRef<string | null>(null);
  const userDataFetchedRef = useRef(false);

  const setUserDataFetchedState = useCallback((value: boolean) => {
    userDataFetchedRef.current = value;
    setUserDataFetched(value);
  }, []);

  const setViewAsRole = useCallback((role: AppRole | null) => {
    if (role) {
      window.localStorage.setItem(VIEW_AS_KEY, role);
    } else {
      window.localStorage.removeItem(VIEW_AS_KEY);
    }
    setViewAsRoleState(role);
  }, []);


  // AUTH_PROFILE_RECOVERY_V2
  const authRequestRef = useRef(0);

  const fetchUserData = useCallback(async (
    authUser: User,
    isLogin: boolean = false,
    force: boolean = false
  ) => {
    if (!force && lastFetchedUserIdRef.current === authUser.id
        && userDataFetchedRef.current) return;

    const request = ++authRequestRef.current;
    setUserDataLoading(true);
    try {
      let profile: UserProfile | null = null;
      let role: AppRole | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (request !== authRequestRef.current) return;
        try {
          const results: any = await Promise.race([
            Promise.all([
              supabase.from('profiles').select('*')
                .eq('id', authUser.id).maybeSingle(),
              supabase.from('user_roles').select('role')
                .eq('user_id', authUser.id).maybeSingle(),
            ]),
            new Promise((_, reject) => {
              const timer = window.setTimeout(
                () => reject(new Error('profile_request_timeout')), 12000
              );
              // O timer não mantém nenhuma sessão ou permissão.
              void timer;
            }),
          ]);
          const [profileResult, roleResult] = results;
          if (!profileResult.error && !roleResult.error
              && profileResult.data && roleResult.data?.role) {
            profile = profileResult.data;
            role = roleResult.data.role;
            break;
          }
        } catch (error) {
          console.error('Falha temporária ao carregar perfil:', error);
        }
        if (attempt < 2) {
          await new Promise(resolve => window.setTimeout(resolve, 1000));
        }
      }

      if (request !== authRequestRef.current) return;
      if (!profile || !role) {
        // Nunca considerar um usuário sem perfil/cargo como carregado.
        setUserDataFetchedState(false);
        return;
      }

      setUser({
        id: authUser.id,
        email: authUser.email || '',
        profile,
        role,
      });
      lastFetchedUserIdRef.current = authUser.id;
      setUserDataFetchedState(true);

      if (isLogin) {
        void (async () => {
          try {
            const ipAddress = await getIpAddress();
            await supabase.from('access_logs').insert({
              user_id: authUser.id,
              action: 'login',
              resource_type: 'session',
              ip_address: ipAddress,
            });
          } catch (error) {
            console.error('Error logging access:', error);
          }
        })();
      }
    } finally {
      if (request === authRequestRef.current) {
        setUserDataLoading(false);
      }
    }
  }, [setUserDataFetchedState]);

  useEffect(() => {
    let active = true;
    let recovering = false;

    const clearIdentity = () => {
      ++authRequestRef.current;
      setSession(null);
      setUser(null);
      lastFetchedUserIdRef.current = null;
      setUserDataFetchedState(false);
      setLoading(false);
    };

    const recover = async (force: boolean = false) => {
      if (!active || recovering) return;
      recovering = true;
      try {
        const result = await supabase.auth.refreshSession();
        if (!active) return;
        const next = result.data?.session;
        if (!next?.user) {
          if (!result.error) clearIdentity();
          return;
        }
        setSession(next);
        await fetchUserData(next.user, false, force);
      } catch (error) {
        console.error('Falha temporária ao restaurar sessão:', error);
      } finally {
        recovering = false;
        if (active) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, next: Session | null) => {
        if (!active || event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT') {
          clearIdentity();
          return;
        }
        if (!next?.user) return;
        setSession(next);

        if (event === 'TOKEN_REFRESHED') return;
        const sameUser = lastFetchedUserIdRef.current === next.user.id;
        if (!sameUser) {
          setUser(null);
          setUserDataFetchedState(false);
        }
        void fetchUserData(
          next.user,
          event === 'SIGNED_IN' && !sameUser,
          event === 'USER_UPDATED' || !userDataFetchedRef.current
        ).finally(() => {
          if (active) setLoading(false);
        });
      }
    );

    void recover(true);

    const onReturn = () => {
      if (document.visibilityState === 'visible') void recover(true);
    };
    const retry = window.setInterval(() => {
      if (!userDataFetchedRef.current
          && document.visibilityState === 'visible') void recover(true);
    }, 5000);

    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);

    return () => {
      active = false;
      ++authRequestRef.current;
      subscription.unsubscribe();
      window.clearInterval(retry);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [fetchUserData, setUserDataFetchedState]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const token =
        (session as any)?.access_token ||
        (session as any)?.accessToken;

      if (!token) {
        return {
          error: new Error(
            'Sessão inválida. Faça login novamente.'
          ),
        };
      }

      const response = await fetch(
        '/api/auth/password',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            password: newPassword,
          }),
        }
      );

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        return {
          error: new Error(
            result?.error?.message ||
            result?.message ||
            'Erro ao atualizar a senha.'
          ),
        };
      }

      return {
        error: null,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error(
                'Erro ao atualizar a senha.'
              ),
      };
    }
  };

  // Combined loading state - only show loading until initial data fetch is complete
  const isLoading = loading || (Boolean(session?.user) && !user && !userDataFetched);

  const realRole = user?.role ?? null;
  const effectiveRole: AppRole | null =
    isDevLevel(realRole) && viewAsRole ? viewAsRole : realRole;
  const exposedUser: AuthUser | null = user
    ? { ...user, role: effectiveRole }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user: exposedUser,
        session,
        loading: isLoading,
        signIn,
        signOut,
        updatePassword,
        realRole,
        viewAsRole: isDevLevel(realRole) ? viewAsRole : null,
        setViewAsRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
