"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  api,
  hasStoredSession,
  clearStoredSession,
  RetryState,
  FetchJsonOptions,
  isTransientError,
} from "./api";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isColdStarting: boolean;
  retryState: RetryState | null;
  connectionError: boolean;
  isAuthenticated: boolean;
  login: (email: string, passwordPlain: string, options?: FetchJsonOptions) => Promise<{ user: AuthUser; token: string }>;
  signup: (email: string, passwordPlain: string, options?: FetchJsonOptions) => Promise<{ user: AuthUser; token: string }>;
  demoLogin: (options?: FetchJsonOptions) => Promise<{ user: AuthUser; token: string }>;
  logout: () => Promise<void>;
  validateSession: () => Promise<boolean>;
  retryConnection: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  const validateSession = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setConnectionError(false);

    try {
      const res = await api.auth.me({
        retry: true,
        onRetry: (state) => {
          setRetryState(state.isRetrying ? state : null);
        },
      });
      setUser(res.user);
      setLoading(false);
      setRetryState(null);
      setConnectionError(false);
      return true;
    } catch (err: any) {
      setRetryState(null);
      if (err?.status === 401) {
        // Session invalid / expired
        clearStoredSession();
        setUser(null);
        setLoading(false);
        setConnectionError(false);
        return false;
      }

      if (isTransientError(err)) {
        // Exhausted retries connecting to backend (e.g. Render wake timeout)
        setLoading(false);
        setConnectionError(true);
        return false;
      }

      // Other unrecoverable error
      clearStoredSession();
      setUser(null);
      setLoading(false);
      return false;
    }
  }, []);

  const retryConnection = useCallback(async (): Promise<boolean> => {
    return await validateSession();
  }, [validateSession]);

  const login = useCallback(
    async (email: string, passwordPlain: string, options?: FetchJsonOptions) => {
      const res = await api.auth.login(email, passwordPlain, options);
      setUser(res.user);
      setConnectionError(false);
      return res;
    },
    []
  );

  const signup = useCallback(
    async (email: string, passwordPlain: string, options?: FetchJsonOptions) => {
      const res = await api.auth.signup(email, passwordPlain, options);
      setUser(res.user);
      setConnectionError(false);
      return res;
    },
    []
  );

  const demoLogin = useCallback(async (options?: FetchJsonOptions) => {
    const res = await api.auth.demoLogin(options);
    setUser(res.user);
    setConnectionError(false);
    return res;
  }, []);

  const logout = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("prepkit_logging_out", "true");
      } catch {}
    }
    try {
      await api.auth.logout();
    } finally {
      clearStoredSession();
      setUser(null);
      setConnectionError(false);
      setRetryState(null);
      if (typeof window !== "undefined" && typeof window.location !== "undefined") {
        window.location.href = "/";
      }
    }
  }, []);

  useEffect(() => {
    // Check if there is any stored session indicator
    if (!hasStoredSession()) {
      // Requirement 7: If there is no stored authentication state -> unauthenticated immediately
      setUser(null);
      setLoading(false);
      return;
    }

    // Requirement 6: Do NOT treat merely having a token in localStorage as proof that the user is authenticated.
    // Validate using existing api.auth.me() endpoint with bounded retry
    validateSession();
  }, [validateSession]);

  const value = {
    user,
    loading,
    isColdStarting: Boolean(retryState?.isRetrying),
    retryState,
    connectionError,
    isAuthenticated: Boolean(user),
    login,
    signup,
    demoLogin,
    logout,
    validateSession,
    retryConnection,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
