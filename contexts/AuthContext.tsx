import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  getCurrentAppUser,
  isAuthenticationApiError,
  loginAppUser,
  logoutAppUser,
} from '@/services/api';
import type { AppUser } from '@/types';

const AUTH_SESSION_STORAGE_KEY = 'gtrots.mobileAuthSession.v1';
const AUTH_PREFERENCES_STORAGE_KEY = 'gtrots.mobileAuthPreferences.v1';

type StoredAuthSession = {
  token: string;
  user: AppUser;
  username: string;
};

interface AuthContextValue {
  token: string;
  user: AppUser | null;
  loading: boolean;
  initializing: boolean;
  rememberedUsername: string;
  rememberedLogin: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: (force?: boolean) => Promise<AppUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [rememberedUsername, setRememberedUsername] = useState('');
  const [rememberedLogin, setRememberedLogin] = useState(true);
  const userRef = useRef<AppUser | null>(null);
  const tokenRef = useRef('');
  const rememberLoginRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<AppUser | null> | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rawSession, rawPreferences] = await Promise.all([
          SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY),
          SecureStore.getItemAsync(AUTH_PREFERENCES_STORAGE_KEY),
        ]);
        if (!active) return;

        if (rawPreferences) {
          try {
            const preferences = JSON.parse(rawPreferences) as { username?: string; rememberMe?: boolean };
            setRememberedUsername(String(preferences.username || ''));
            setRememberedLogin(preferences.rememberMe !== false);
          } catch {}
        }

        if (!rawSession) return;
        const session = JSON.parse(rawSession) as StoredAuthSession;
        if (!session.token || !session.user?.id) {
          await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
          return;
        }

        rememberLoginRef.current = true;
        tokenRef.current = session.token;
        userRef.current = session.user;
        setToken(session.token);
        setUser(session.user);
        setRememberedUsername(session.username || session.user.username || '');
        lastRefreshAtRef.current = Date.now();
        // Afisam imediat aplicatia din sesiunea securizata; validarea continua in fundal.
        setInitializing(false);

        try {
          const freshUser = await getCurrentAppUser(session.token);
          if (!active) return;
          userRef.current = freshUser;
          setUser(freshUser);
          await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            ...session,
            user: freshUser,
          }));
        } catch (error) {
          if (isAuthenticationApiError(error)) {
            await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
            if (!active) return;
            rememberLoginRef.current = false;
            tokenRef.current = '';
            userRef.current = null;
            setToken('');
            setUser(null);
          }
        }
      } catch {
        // Configuratia salvata nu trebuie sa blocheze pornirea aplicatiei.
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, rememberMe = true) => {
    setLoading(true);
    try {
      const normalizedUsername = username.trim();
      const result = await loginAppUser(normalizedUsername, password, 'mobile', rememberMe);
      tokenRef.current = result.token;
      setToken(result.token);
      setUser(result.user);
      userRef.current = result.user;
      rememberLoginRef.current = rememberMe;
      setRememberedUsername(normalizedUsername);
      setRememberedLogin(rememberMe);
      lastRefreshAtRef.current = Date.now();
      await SecureStore.setItemAsync(AUTH_PREFERENCES_STORAGE_KEY, JSON.stringify({
        username: normalizedUsername,
        rememberMe,
      })).catch(() => {});
      if (rememberMe) {
        await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
          token: result.token,
          user: result.user,
          username: normalizedUsername,
        } satisfies StoredAuthSession)).catch(() => {});
      } else {
        await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const currentToken = tokenRef.current;
    tokenRef.current = '';
    rememberLoginRef.current = false;
    setToken('');
    setUser(null);
    userRef.current = null;
    lastRefreshAtRef.current = 0;
    refreshInFlightRef.current = null;
    await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY).catch(() => {});
    if (currentToken) {
      try {
        await logoutAppUser(currentToken);
      } catch {}
    }
  }, []);

  const refreshUser = useCallback(async (force = false) => {
    if (!token) return null;
    if (!force && userRef.current && Date.now() - lastRefreshAtRef.current < 10000) {
      return userRef.current;
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const request = getCurrentAppUser(token)
      .then((freshUser) => {
        lastRefreshAtRef.current = Date.now();
        userRef.current = freshUser;
        setUser((current) => JSON.stringify(current) === JSON.stringify(freshUser) ? current : freshUser);
        if (rememberLoginRef.current) {
          SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            token,
            user: freshUser,
            username: freshUser.username || rememberedUsername,
          })).catch(() => {});
        }
        return freshUser;
      })
      .catch(async (error) => {
        if (isAuthenticationApiError(error)) {
          tokenRef.current = '';
          rememberLoginRef.current = false;
          setToken('');
          setUser(null);
          userRef.current = null;
          lastRefreshAtRef.current = 0;
          await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY).catch(() => {});
          return null;
        }
        // O eroare temporara de internet/API nu invalideaza o sesiune locala valida.
        lastRefreshAtRef.current = Date.now();
        return userRef.current;
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });
    refreshInFlightRef.current = request;
    return request;
  }, [rememberedUsername, token]);

  useEffect(() => {
    if (!token) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshUser();
      }
    });
    return () => subscription.remove();
  }, [refreshUser, token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      initializing,
      rememberedUsername,
      rememberedLogin,
      login,
      logout,
      refreshUser,
    }),
    [
      token,
      user,
      loading,
      initializing,
      rememberedUsername,
      rememberedLogin,
      login,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
