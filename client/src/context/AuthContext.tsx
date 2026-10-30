import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthenticatedUser, LoginRequestDTO } from '../types';
import { loginApi, refreshSessionApi, logoutApi } from '../api/auth.api';

export interface ToastNotification {
  message: string;
  type: 'success' | 'error';
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequestDTO) => Promise<void>;
  logout: () => Promise<boolean>;
  refreshSession: () => Promise<string | null>;
  toast: ToastNotification | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  clearToast: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In-memory token ref for synchronized access inside callbacks
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken;

  // Schedules automatic proactive token renewal before expiration (e.g. at 14 minutes)
  const scheduleTokenRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Schedule refresh 60 seconds prior to token expiration (minimum 10 seconds)
    const delayMs = Math.max((expiresInSeconds - 60) * 1000, 10000);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const data = await refreshSessionApi();
        setAccessToken(data.access_token);
        setUser(data.user);
        scheduleTokenRefresh(data.expires_in || 900);
      } catch (err) {
        console.warn('[AuthContext] Proactive session refresh failed:', err);
      }
    }, delayMs);
  }, []);

  // Silent session restoration on initial application load via HttpOnly cookie
  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const data = await refreshSessionApi();
      setAccessToken(data.access_token);
      setUser(data.user);
      scheduleTokenRefresh(data.expires_in || 900);
      return data.access_token;
    } catch {
      setAccessToken(null);
      setUser(null);
      return null;
    }
  }, [scheduleTokenRefresh]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const data = await refreshSessionApi();
        if (isMounted) {
          setAccessToken(data.access_token);
          setUser(data.user);
          scheduleTokenRefresh(data.expires_in || 900);
        }
      } catch {
        // No active session cookie or expired
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleTokenRefresh]);

  // Login handler
  const login = async (credentials: LoginRequestDTO) => {
    const data = await loginApi(credentials);
    setAccessToken(data.access_token);
    setUser(data.user);
    scheduleTokenRefresh(data.expires_in || 900);
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  // Logout handler
  const logout = async (): Promise<boolean> => {
    const currentToken = tokenRef.current;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    let isSuccess = false;
    try {
      isSuccess = await logoutApi(currentToken);
      if (isSuccess) {
        showToast('Successfully logged out!', 'success');
      }
    } finally {
      setAccessToken(null);
      setUser(null);
    }
    return isSuccess;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: Boolean(user && accessToken),
        isLoading,
        login,
        logout,
        refreshSession,
        toast,
        showToast,
        clearToast
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
