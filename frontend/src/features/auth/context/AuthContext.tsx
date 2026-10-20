import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import { authApi } from '../api/authApi';
import { LoginPayload, RegisterPayload, UserResponse } from '../types/auth';

interface AuthContextType {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  loginWithOAuth: (provider: 'google' | 'github') => Promise<void>;
  loginWithMagicLink: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  syncSessionWithBackend: (accessToken: string, email: string, username?: string, avatarUrl?: string | null) => Promise<UserResponse | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const syncSessionWithBackend = async (accessToken: string, email: string, username?: string, avatarUrl?: string | null) => {
    try {
      const syncedUser = await authApi.syncSupabase({
        accessToken,
        email,
        username,
      });
      if (syncedUser && avatarUrl) {
        syncedUser.avatarUrl = avatarUrl;
      }
      setUser(syncedUser);
      return syncedUser;
    } catch (err) {
      console.warn('Failed to sync Supabase session with backend:', err);
      try {
        const currentUser = await authApi.getCurrentUser();
        if (currentUser && avatarUrl) {
          currentUser.avatarUrl = avatarUrl;
        }
        setUser(currentUser);
        return currentUser;
      } catch {
        setUser(null);
        return null;
      }
    }
  };

  const refreshUser = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.email && data.session.access_token) {
        const meta = data.session.user.user_metadata || {};
        const avatarUrl = meta.avatar_url || meta.picture || null;
        await syncSessionWithBackend(
          data.session.access_token,
          data.session.user.email,
          meta.full_name || meta.name || meta.username,
          avatarUrl
        );
      } else {
        const currentUser = await authApi.getCurrentUser();
        setUser(currentUser);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (session?.user?.email && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        const meta = session.user.user_metadata || {};
        const avatarUrl = meta.avatar_url || meta.picture || null;
        await syncSessionWithBackend(
          session.access_token,
          session.user.email,
          meta.full_name || meta.name || meta.username,
          avatarUrl
        );
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loginWithOAuth = async (provider: 'google' | 'github') => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      throw new Error(error.message || `Failed to initiate OAuth sign-in with ${provider}`);
    }

    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const loginWithMagicLink = async (email: string) => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to send login email link.');
    }
  };

  const login = async (payload: LoginPayload) => {
    const input = payload.usernameOrEmail.trim();
    const isEmail = input.includes('@');

    // 1. If it looks like an email, attempt primary sign-in with Supabase
    if (isEmail) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: input,
          password: payload.password,
        });

        if (!error && data?.session?.user?.email && data.session.access_token) {
          const meta = data.session.user.user_metadata || {};
          const avatarUrl = meta.avatar_url || meta.picture || null;
          const syncedUser = await syncSessionWithBackend(
            data.session.access_token,
            data.session.user.email,
            meta.full_name || meta.name || meta.username,
            avatarUrl
          );
          if (syncedUser) {
            return;
          }
        }
      } catch (e) {
        console.warn('Supabase email login failed, falling back to backend login:', e);
      }
    }

    // 2. If it is a username (no '@') or if Supabase login failed (e.g. password changed via backend reset),
    // authenticate directly against the Spring Boot backend
    try {
      const backendUser = await authApi.login({
        usernameOrEmail: input,
        password: payload.password,
      });

      setUser(backendUser);

      // Opportunistically attempt to establish a Supabase session if user has an email
      if (backendUser.email) {
        supabase.auth.signInWithPassword({
          email: backendUser.email,
          password: payload.password,
        }).catch((err) => {
          console.warn('Background Supabase session sync after backend auth failed:', err);
        });
      }
    } catch (err: any) {
      throw new Error(err.detail || err.message || 'Invalid username/email or password.');
    }
  };

  const register = async (payload: RegisterPayload) => {
    // 1. Create user in Supabase with auto-confirmed email via backend admin API
    await authApi.supabaseSignUp(payload);

    // 2. Sign in to Supabase to obtain client session and tokens
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email.trim(),
      password: payload.password,
    });

    if (error) {
      throw new Error(error.message || 'Registration completed, but sign-in failed.');
    }

    if (!data.session?.user?.email || !data.session.access_token) {
      throw new Error('Account created, but no active session was established.');
    }

    // 3. Sync Supabase session with backend
    await syncSessionWithBackend(
      data.session.access_token,
      payload.email.trim(),
      payload.username.trim()
    );
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut error:', e);
    }

    try {
      await authApi.logout();
    } catch (e) {
      console.warn('Backend logout error:', e);
    }

    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        loginWithOAuth,
        loginWithMagicLink,
        logout,
        refreshUser,
        syncSessionWithBackend,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
