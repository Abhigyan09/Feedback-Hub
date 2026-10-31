import {
  LoginRequestDTO,
  LoginResponseDTO,
  RefreshResponseDTO,
  AuthenticatedUser,
  ForgotPasswordRequestDTO,
  ResetPasswordRequestDTO
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export class AuthError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Authenticates user credentials against the backend.
 * Delivers the HttpOnly refresh token cookie via credentials: 'include'.
 */
export async function loginApi(payload: LoginRequestDTO): Promise<LoginResponseDTO> {
  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthError(
      data.message || data.error || 'Authentication failed. Please check your credentials.',
      response.status,
      data.code
    );
  }

  return data as LoginResponseDTO;
}

let inFlightRefreshPromise: Promise<RefreshResponseDTO> | null = null;

/**
 * Silently renews the in-memory access token using the HttpOnly refresh cookie.
 * Deduplicates concurrent in-flight calls to prevent single-use token rotation race conditions.
 */
export async function refreshSessionApi(): Promise<RefreshResponseDTO> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new AuthError(
          data.message || data.error || 'Session expired. Please sign in again.',
          response.status,
          data.code
        );
      }

      return data as RefreshResponseDTO;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

/**
 * Logs out the current user session by revoking refresh tokens and clearing the cookie.
 * Returns true if logout API succeeded (HTTP 200), false otherwise.
 */
export async function logoutApi(accessToken?: string | null): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers,
      credentials: 'include'
    });
    return response.ok;
  } catch (err) {
    console.warn('[Auth API] Logout request encountered network error:', err);
    return false;
  }
}

/**
 * Retrieves the currently authenticated user's profile claims from /api/v1/auth/me.
 */
export async function getMeApi(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_BASE}/api/v1/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    credentials: 'include'
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthError(
      data.message || data.error || 'Failed to fetch user profile.',
      response.status,
      data.code
    );
  }

  return data.user as AuthenticatedUser;
}

/**
 * Authenticated API Fetch utility with automatic token attachment and 401 refresh retry.
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {},
  tokenProvider: {
    getToken: () => string | null;
    refreshToken: () => Promise<string | null>;
  }
): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const token = tokenProvider.getToken();

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  // If access token expired (401), try silent renewal once
  if (response.status === 401 && token) {
    const newToken = await tokenProvider.refreshToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
      });
    }
  }

  return response;
}

/**
 * Requests a password reset link for the given email (and optional tenant slug).
 */
export async function forgotPasswordApi(payload: ForgotPasswordRequestDTO): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthError(
      data.message || data.error || 'Failed to submit password reset request.',
      response.status,
      data.code
    );
  }

  return data as { message: string };
}

/**
 * Resets password using the received token and new password.
 */
export async function resetPasswordApi(payload: ResetPasswordRequestDTO): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthError(
      data.message || data.error || 'Failed to reset password.',
      response.status,
      data.code
    );
  }

  return data as { message: string };
}

