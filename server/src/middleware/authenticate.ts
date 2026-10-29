import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service.js';
import { AuthContext } from './tenantContext.js';

/**
 * Reusable JWT Authentication Middleware for Express routes.
 * 
 * Enforces authentication via the standard HTTP Authorization header:
 * Authorization: Bearer <access_token>
 * 
 * Verifies the token cryptographically, rejects missing/malformed/expired/tampered tokens
 * with consistent HTTP 401 responses, and attaches a typed `req.auth` context.
 * 
 * Security Guard:
 * Never trusts client-supplied headers (x-user-id, x-user-role, x-tenant-id, etc.).
 * Identity is derived strictly and exclusively from verified JWT claims.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication Required',
      code: 'AUTH_HEADER_MISSING',
      message: 'Authorization header is missing. Please provide a Bearer access token.'
    });
  }

  // Enforce standard 'Bearer <token>' schema
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1].trim()) {
    return res.status(401).json({
      error: 'Authentication Required',
      code: 'AUTH_HEADER_MALFORMED',
      message: 'Authorization header format must be: Bearer <access_token>'
    });
  }

  const token = parts[1].trim();

  try {
    const claims = verifyAccessToken(token);

    // Attach typed user context strictly from verified JWT claims.
    // Client-supplied headers are completely ignored.
    const authContext: AuthContext = {
      userId: claims.sub,
      tenantId: claims.tenant_id,
      role: claims.role,
      email: claims.email,
      fullName: claims.full_name || ''
    };

    req.auth = authContext;

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token Expired',
        code: 'TOKEN_EXPIRED',
        message: 'Your authentication token has expired. Please log in again to renew your session.'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid Token',
        code: 'TOKEN_INVALID',
        message: 'The provided authentication token signature or payload is invalid.'
      });
    }

    return res.status(401).json({
      error: 'Unauthorized',
      code: 'AUTH_FAILED',
      message: err.message || 'Authentication verification failed.'
    });
  }
};

// Backwards-compatible / descriptive alias
export const authenticateJWT = authenticate;
