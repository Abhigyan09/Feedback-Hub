import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { ENV } from '../config/env.js';
import { withTransaction } from '../config/db.js';
import {
  verifyPassword,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  isValidRefreshTokenFormat,
  generatePasswordResetToken,
  hashResetToken,
  isValidResetTokenFormat
} from '../services/auth.service.js';
import {
  findTenantBySlug,
  findTenantById,
  findUserByTenantAndEmail,
  findUserById,
  findUserByEmail,
  createRefreshToken,
  findRefreshTokenForUpdate,
  revokeRefreshToken,
  revokeTokenFamily,
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  markPasswordResetTokenUsed,
  updateUserPassword,
  revokeAllUserRefreshTokens
} from '../services/auth.repository.js';
import { sendPasswordResetEmail } from '../services/email.service.js';
import { LoginResponseDTO, RefreshResponseDTO, AuthenticatedUserResponse } from '../types/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { disconnectUserSockets } from '../services/socket.js';

export const authRouter = Router();

// ==============================================================================
// VALIDATION SCHEMA FOR LOGIN
// ==============================================================================
export const loginRequestSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'A valid email address is required' })
    .max(255, { message: 'Email cannot exceed 255 characters' }),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, { message: 'Password cannot be empty' })
    .max(256, { message: 'Password cannot exceed 256 characters' }),
  tenant_slug: z
    .string({ required_error: 'Tenant slug is required' })
    .trim()
    .min(1, { message: 'Tenant slug cannot be empty' })
    .max(100, { message: 'Tenant slug cannot exceed 100 characters' })
});

// ==============================================================================
// POST /api/v1/auth/login
// ==============================================================================
authRouter.post('/login', async (req: Request, res: Response) => {
  // 1. Validate request body
  const parseResult = loginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request payload',
      details: parseResult.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  const { email, password, tenant_slug } = parseResult.data;

  try {
    // 2. Resolve tenant by slug
    const tenant = await findTenantBySlug(tenant_slug);
    if (!tenant) {
      // Generic error: prevent tenant enumeration attacks
      return res.status(401).json({
        error: 'Invalid credentials or organization'
      });
    }

    // 3. Find user strictly within the resolved tenant boundary
    const user = await findUserByTenantAndEmail(tenant.id, email);
    if (!user) {
      // Generic error: prevent user email enumeration attacks
      return res.status(401).json({
        error: 'Invalid credentials or organization'
      });
    }

    // 4. Verify password with Argon2id
    const isPasswordValid = await verifyPassword(user.password_hash, password);
    if (!isPasswordValid) {
      // Generic error: do not distinguish wrong password from missing user
      return res.status(401).json({
        error: 'Invalid credentials or organization'
      });
    }

    // 5. Reject deactivated users
    if (!user.is_active) {
      return res.status(403).json({
        error: 'Account deactivated',
        message: 'This user account has been deactivated. Please contact your organization administrator.'
      });
    }

    // 6. Generate signed JWT access token (15m expiry)
    const accessToken = signAccessToken({
      sub: user.id,
      tenant_id: tenant.id,
      role: user.role,
      email: user.email,
      full_name: user.full_name
    });

    // 7. Generate cryptographically secure refresh token (512-bit entropy)
    const { token: rawRefreshToken, tokenHash } = generateRefreshToken();

    // 8. Establish new session family
    const familyId = crypto.randomUUID();
    const refreshExpiresAt = new Date(Date.now() + 7 * 86400000); // 7 days

    // 9. Persist refresh token hash inside transaction
    await withTransaction(async (client) => {
      await createRefreshToken(
        {
          user_id: user.id,
          tenant_id: tenant.id,
          token_hash: tokenHash,
          family_id: familyId,
          expires_at: refreshExpiresAt
        },
        client
      );
    });

    // 10. Deliver refresh token through HttpOnly, SameSite=Strict cookie
    const isSecure = ENV.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('refresh_token', rawRefreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 86400000 // 7 days in milliseconds
    });

    // 11. Return response with sanitized user info (no hashes/secrets)
    const responseData: LoginResponseDTO = {
      message: 'Authentication successful',
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_slug: tenant.slug
      }
    };

    return res.status(200).json(responseData);
  } catch (err: any) {
    console.error('[Auth Error: Login]', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred during authentication.'
    });
  }
});

// ==============================================================================
// POST /api/v1/auth/refresh (Session Renewal & Single-Use Token Rotation)
// ==============================================================================
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const isSecure = ENV.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict' as const,
    path: '/api/v1/auth'
  };

  // 1. Read refresh token from HttpOnly cookie (with optional fallback to request body)
  const rawRefreshToken = req.cookies?.refresh_token || (typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : null);

  if (!rawRefreshToken) {
    return res.status(401).json({
      error: 'Authentication Required',
      code: 'REFRESH_TOKEN_MISSING',
      message: 'Refresh token is missing. Please provide the refresh_token cookie.'
    });
  }

  // 2. Validate token format (must be 128 hex chars / 512-bit entropy)
  if (!isValidRefreshTokenFormat(rawRefreshToken)) {
    res.clearCookie('refresh_token', cookieOptions);
    return res.status(401).json({
      error: 'Invalid Token',
      code: 'REFRESH_TOKEN_INVALID',
      message: 'The provided refresh token format is invalid.'
    });
  }

  // 3. Compute SHA-256 hash to query persistence
  const tokenHash = hashRefreshToken(rawRefreshToken);

  try {
    let result: {
      newAccessToken: string;
      newRawRefreshToken: string;
      user: AuthenticatedUserResponse;
    } | null = null;

    let statusCode = 200;
    let errorResponse: { error: string; code: string; message: string } | null = null;

    // 4. Execute token rotation safely inside transaction with row locking
    await withTransaction(async (client) => {
      // Find and row-lock the refresh token record (FOR UPDATE)
      const storedToken = await findRefreshTokenForUpdate(tokenHash, client);

      if (!storedToken) {
        statusCode = 401;
        errorResponse = {
          error: 'Invalid Session',
          code: 'TOKEN_NOT_FOUND',
          message: 'The provided session could not be verified or has been expired.'
        };
        return;
      }

      // Reuse Detection: A revoked token was presented again!
      // This is a sign of compromise / replay attack. Invalidate entire family immediately.
      if (storedToken.is_revoked) {
        await revokeTokenFamily(storedToken.family_id, client);
        statusCode = 401;
        errorResponse = {
          error: 'Security Alert: Token Reuse Detected',
          code: 'TOKEN_REUSE_DETECTED',
          message: 'A previously rotated refresh token was presented. All active sessions in this family have been terminated for security.'
        };
        return;
      }

      // Check Expiration
      if (new Date(storedToken.expires_at).getTime() <= Date.now()) {
        await revokeRefreshToken(tokenHash, undefined, client);
        statusCode = 401;
        errorResponse = {
          error: 'Session Expired',
          code: 'TOKEN_EXPIRED',
          message: 'Your session has expired. Please log in again.'
        };
        return;
      }

      // Validate Tenant Association
      const tenant = await findTenantById(storedToken.tenant_id, client);
      if (!tenant) {
        await revokeTokenFamily(storedToken.family_id, client);
        statusCode = 401;
        errorResponse = {
          error: 'Unauthorized',
          code: 'TENANT_NOT_FOUND',
          message: 'The organization associated with this session is no longer active.'
        };
        return;
      }

      // Validate User Status strictly within Tenant boundary
      const user = await findUserById(storedToken.tenant_id, storedToken.user_id, client);
      if (!user) {
        await revokeTokenFamily(storedToken.family_id, client);
        statusCode = 401;
        errorResponse = {
          error: 'Unauthorized',
          code: 'USER_NOT_FOUND',
          message: 'The user account associated with this session no longer exists.'
        };
        return;
      }

      // Inactive User Rejection
      if (!user.is_active) {
        await revokeTokenFamily(storedToken.family_id, client);
        statusCode = 403;
        errorResponse = {
          error: 'Account Deactivated',
          code: 'USER_INACTIVE',
          message: 'This user account has been deactivated. Please contact your organization administrator.'
        };
        return;
      }

      // 5. Rotate Refresh Token: Revoke presented token and issue replacement in same family
      const { token: newRawRefreshToken, tokenHash: newRefreshTokenHash } = generateRefreshToken();
      const newExpiresAt = new Date(Date.now() + 7 * 86400000); // 7 days

      // Mark current token revoked with replacement hash for lineage tracking
      await revokeRefreshToken(tokenHash, newRefreshTokenHash, client);

      // Persist replacement token in same family
      await createRefreshToken(
        {
          user_id: user.id,
          tenant_id: tenant.id,
          token_hash: newRefreshTokenHash,
          family_id: storedToken.family_id,
          expires_at: newExpiresAt
        },
        client
      );

      // 6. Sign new short-lived JWT access token
      const newAccessToken = signAccessToken({
        sub: user.id,
        tenant_id: tenant.id,
        role: user.role,
        email: user.email,
        full_name: user.full_name
      });

      result = {
        newAccessToken,
        newRawRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          tenant_slug: tenant.slug
        }
      };
    });

    // If an error occurred inside the transaction, clear cookie and return sanitized error
    if (errorResponse) {
      res.clearCookie('refresh_token', cookieOptions);
      return res.status(statusCode).json(errorResponse);
    }

    if (!result) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to complete session rotation.'
      });
    }

    // 7. Deliver new refresh token through HttpOnly cookie
    res.cookie('refresh_token', (result as any).newRawRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 86400000
    });

    // 8. Return response (raw refresh token is NEVER exposed in the JSON payload)
    const responsePayload: RefreshResponseDTO = {
      message: 'Session refreshed successfully',
      access_token: (result as any).newAccessToken,
      token_type: 'Bearer',
      expires_in: 900,
      user: (result as any).user
    };

    return res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error('[Auth Error: Refresh]', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred during session refresh.'
    });
  }
});

// ==============================================================================
// POST /api/v1/auth/logout (Idempotent Session Invalidation & Cookie Clearing)
// ==============================================================================
authRouter.post('/logout', async (req: Request, res: Response) => {
  const isSecure = ENV.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict' as const,
    path: '/api/v1/auth'
  };

  // 1. Always clear the refresh_token cookie with matching Path and security flags
  res.clearCookie('refresh_token', cookieOptions);

  // 2. Read refresh token from HttpOnly cookie (or body fallback)
  const rawRefreshToken = req.cookies?.refresh_token || (typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : null);

  // Helper to extract user ID from optional Bearer token in Authorization header
  let userIdToDisconnect: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.trim().startsWith('Bearer ')) {
    try {
      const token = authHeader.trim().slice(7).trim();
      const claims = verifyAccessToken(token);
      if (claims?.sub) {
        userIdToDisconnect = claims.sub;
      }
    } catch {
      // Ignore token verification failure on logout
    }
  }

  // If no token is provided or format is invalid, return success idempotently
  if (!rawRefreshToken || !isValidRefreshTokenFormat(rawRefreshToken)) {
    if (userIdToDisconnect) {
      disconnectUserSockets(userIdToDisconnect);
    }
    return res.status(200).json({
      message: 'Successfully logged out'
    });
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);

  try {
    // 3. Invalidate session inside transaction
    await withTransaction(async (client) => {
      const storedToken = await findRefreshTokenForUpdate(tokenHash, client);

      // If token exists and is active, revoke it and its family
      if (storedToken) {
        if (!storedToken.is_revoked) {
          await revokeRefreshToken(tokenHash, undefined, client);
          await revokeTokenFamily(storedToken.family_id, client);
        }
        userIdToDisconnect = storedToken.user_id;
      }
    });

    // 4. Terminate any active WebSocket connections for this user
    if (userIdToDisconnect) {
      disconnectUserSockets(userIdToDisconnect);
    }

    return res.status(200).json({
      message: 'Successfully logged out'
    });
  } catch (err: any) {
    console.error('[Auth Error: Logout]', err);
    if (userIdToDisconnect) {
      disconnectUserSockets(userIdToDisconnect);
    }
    // Return standard generic message to avoid leaking internal database details
    return res.status(200).json({
      message: 'Successfully logged out'
    });
  }
});

// ==============================================================================
// GET /api/v1/auth/me (Protected: Requires verified Bearer access token)
// ==============================================================================
authRouter.get('/me', authenticate, (req: Request, res: Response) => {
  return res.status(200).json({
    user: {
      id: req.auth!.userId,
      email: req.auth!.email,
      full_name: req.auth!.fullName,
      role: req.auth!.role,
      tenant_id: req.auth!.tenantId
    }
  });
});

// ==============================================================================
// VALIDATION SCHEMAS FOR PASSWORD RESET
// ==============================================================================
export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'A valid email address is required' })
    .max(255, { message: 'Email cannot exceed 255 characters' }),
  tenant_slug: z
    .string()
    .trim()
    .max(100)
    .optional()
});

export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: 'Reset token is required' })
    .trim()
    .min(1, { message: 'Reset token is required' }),
  new_password: z
    .string({ required_error: 'New password is required' })
    .min(8, { message: 'Password must be at least 8 characters long' })
    .max(256, { message: 'Password cannot exceed 256 characters' })
});

// ==============================================================================
// POST /forgot-password
// Generates single-use reset token and dispatches email (anti-enumeration safe)
// ==============================================================================
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const parseResult = forgotPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request payload',
      details: parseResult.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  const { email, tenant_slug } = parseResult.data;
  const genericSuccessMessage = 'If an account matches that email, a password reset link has been dispatched.';

  try {
    const lookup = await findUserByEmail(email, tenant_slug);
    if (!lookup || !lookup.user || !lookup.user.is_active) {
      // Anti-enumeration: return standard 200 OK without disclosing user absence
      return res.status(200).json({ message: genericSuccessMessage });
    }

    const { user, tenant } = lookup;
    const { token: rawResetToken, tokenHash } = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiration

    await withTransaction(async (client) => {
      await createPasswordResetToken(
        {
          user_id: user.id,
          tenant_id: tenant.id,
          token_hash: tokenHash,
          expires_at: expiresAt
        },
        client
      );
    });

    await sendPasswordResetEmail({
      toEmail: user.email,
      recipientName: user.full_name,
      resetToken: rawResetToken
    });

    return res.status(200).json({ message: genericSuccessMessage });
  } catch (err: any) {
    console.error('[Auth Error: Forgot Password]', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing your request.'
    });
  }
});

// ==============================================================================
// POST /reset-password
// Verifies single-use token, enforces expiration, updates password with Argon2id,
// and revokes all active sessions for that user.
// ==============================================================================
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const parseResult = resetPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request payload',
      details: parseResult.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
  }

  const { token, new_password } = parseResult.data;

  if (!isValidResetTokenFormat(token)) {
    return res.status(400).json({
      error: 'Invalid Token',
      code: 'INVALID_TOKEN',
      message: 'The password reset token is invalid or malformed.'
    });
  }

  const tokenHash = hashResetToken(token);

  try {
    let affectedUserId: string | null = null;
    let failureResponse: { status: number; error: string; code: string; message: string } | null = null;

    await withTransaction(async (client) => {
      const storedToken = await findPasswordResetTokenByHash(tokenHash, client);

      if (!storedToken) {
        failureResponse = {
          status: 400,
          error: 'Invalid Token',
          code: 'INVALID_TOKEN',
          message: 'The password reset token was not found or is invalid.'
        };
        return;
      }

      if (storedToken.is_used) {
        failureResponse = {
          status: 400,
          error: 'Token Already Used',
          code: 'TOKEN_ALREADY_USED',
          message: 'This password reset link has already been used. Please request a new one.'
        };
        return;
      }

      if (new Date(storedToken.expires_at).getTime() < Date.now()) {
        failureResponse = {
          status: 400,
          error: 'Token Expired',
          code: 'TOKEN_EXPIRED',
          message: 'This password reset link has expired. Please request a new one.'
        };
        return;
      }

      const user = await findUserById(storedToken.tenant_id, storedToken.user_id, client);
      if (!user) {
        failureResponse = {
          status: 400,
          error: 'User Not Found',
          code: 'USER_NOT_FOUND',
          message: 'The user account associated with this token no longer exists.'
        };
        return;
      }

      // Hash new password using existing Argon2id configuration
      const newPasswordHash = await hashPassword(new_password);

      // Update password in database / store
      await updateUserPassword(user.id, newPasswordHash, client);

      // Enforce single-use: mark token as used
      await markPasswordResetTokenUsed(tokenHash, client);

      // Invalidate all active sessions / refresh tokens for this user
      await revokeAllUserRefreshTokens(user.id, client);

      affectedUserId = user.id;
    });

    if (failureResponse) {
      return res.status((failureResponse as any).status).json(failureResponse);
    }

    // Forcibly terminate any live WebSocket connections for this user across all tabs/devices
    if (affectedUserId) {
      disconnectUserSockets(affectedUserId);
    }

    return res.status(200).json({
      message: 'Password has been successfully reset. Please sign in with your new password.'
    });
  } catch (err: any) {
    console.error('[Auth Error: Reset Password]', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while resetting your password.'
    });
  }
});



