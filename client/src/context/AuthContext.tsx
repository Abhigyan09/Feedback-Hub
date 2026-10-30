import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthenticatedUser, LoginRequestDTO } from '../types';
import { loginApi, refreshSessionApi, logoutApi } from '../api/auth.api';

export interface ToastNotification {
  message: string;
  type: 'success' | 'error';
}

export function isJwtExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    if (!parsed.exp) return true;
    // Proactive buffer by 30 seconds
    return Date.now() >= (parsed.exp * 1000 - 30000);
  } catch {
    return true;
  }
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequestDTO) => Promise<void>;
  logout: () => Promise<boolean>;
  refreshSession: () => Promise<string | null>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  toast: ToastNotification | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  clearToast: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Synchronous restoration from localStorage on page refresh prevents flash/logout
  const [user, setUser] = useState<AuthenticatedUser | null>(() => {
    try {
      const stored = localStorage.getItem('fb_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem('fb_access_token') || null;
  });

  // Only start non-blocking if we have cached user AND a NON-EXPIRED access token.
  // If the access token is expired, we must block on refreshSession to avoid 401 storms.
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      const storedUser = localStorage.getItem('fb_user');
      const storedToken = localStorage.getItem('fb_access_token');
      return !(storedUser && storedToken && !isJwtExpired(storedToken));
    } catch {
      return true;
    }
  });

  const [toast, setToast] = useState<ToastNotification | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedRef = useRef<boolean>(false);

  // In-memory token ref for synchronized access inside callbacks
  const tokenRef = useRef<string | null>(accessToken);
  tokenRef.current = accessToken;

  // Synchronized state and localStorage updater
  const updateSessionState = useCallback((newUser: AuthenticatedUser | null, newAccessToken: string | null) => {
    setUser(newUser);
    setAccessToken(newAccessToken);
    if (newUser && newAccessToken) {
      try {
        localStorage.setItem('fb_user', JSON.stringify(newUser));
        localStorage.setItem('fb_access_token', newAccessToken);
      } catch (err) {
        console.warn('[AuthContext] Failed to cache session in localStorage:', err);
      }
    } else {
      try {
        localStorage.removeItem('fb_user');
        localStorage.removeItem('fb_access_token');
      } catch (err) {
        console.warn('[AuthContext] Failed to clear session from localStorage:', err);
      }
    }
  }, []);

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
        updateSessionState(data.user, data.access_token);
        scheduleTokenRefresh(data.expires_in || 900);
      } catch (err) {
        console.warn('[AuthContext] Proactive session refresh failed:', err);
      }
    }, delayMs);
  }, [updateSessionState]);

  // Silent session restoration via HttpOnly cookie
  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const data = await refreshSessionApi();
      updateSessionState(data.user, data.access_token);
      scheduleTokenRefresh(data.expires_in || 900);
      return data.access_token;
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        updateSessionState(null, null);
      }
      return null;
    }
  }, [scheduleTokenRefresh, updateSessionState]);

  // Run initial session verification once per application mount
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initializeAuth = async () => {
      try {
        const data = await refreshSessionApi();
        updateSessionState(data.user, data.access_token);
        scheduleTokenRefresh(data.expires_in || 900);
      } catch (err: any) {
        // Only clear credentials if backend explicitly invalidates/rejects the refresh token
        if (err?.status === 401 || err?.status === 403) {
          updateSessionState(null, null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [scheduleTokenRefresh, updateSessionState]);

  // Login handler
  const login = async (credentials: LoginRequestDTO) => {
    const data = await loginApi(credentials);
    updateSessionState(data.user, data.access_token);
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
      updateSessionState(null, null);
    }
    return isSuccess;
  };

  // Authenticated API request helper with auto-token injection and single 401 refresh retry
  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      let currentToken = tokenRef.current;

      // If token is known to be expired, refresh proactively
      if (currentToken && isJwtExpired(currentToken)) {
        currentToken = await refreshSession();
      }

      const headers = new Headers(init?.headers || {});
      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }

      let response = await fetch(url, {
        ...init,
        headers,
        credentials: 'include'
      });

      // If unauthorized (401), try silent renewal once and replay request
      if (response.status === 401) {
        const newToken = await refreshSession();
        if (newToken) {
          headers.set('Authorization', `Bearer ${newToken}`);
          response = await fetch(url, {
            ...init,
            headers,
            credentials: 'include'
          });
        }
      }

      return response;
    },
    [refreshSession]
  );

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
        authFetch,
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
