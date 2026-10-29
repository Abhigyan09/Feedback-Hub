import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ENV } from '../config/env.js';

/**
 * Validates whether a request origin is permitted under the application security policy.
 * 
 * Rules:
 * - If no origin header is present (non-browser requests: curl, server-to-server, mobile native SDKs), allowed.
 * - In development/test mode: allows localhost/127.0.0.1 on any port, or origins in ENV.CORS_ORIGIN.
 * - In production mode: strictly allows ONLY origins configured in ENV.CORS_ORIGIN. Wildcards are forbidden.
 */
export function validateOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const allowedOrigins = Array.isArray(ENV.CORS_ORIGIN) ? ENV.CORS_ORIGIN : [ENV.CORS_ORIGIN];

  // In non-production, permit local development frontend ports
  if (ENV.NODE_ENV !== 'production') {
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      return true;
    }
  }

  // In production, strictly match allowlist
  return allowedOrigins.includes(origin);
}

/**
 * Express CORS Middleware with dynamic origin validation and credential support.
 * Never issues wildcard Access-Control-Allow-Origin: * when credentials are used.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (validateOrigin(origin)) {
      return callback(null, origin);
    }

    const error = new Error(`CORS Error: Origin '${origin}' is not permitted by security policy.`);
    (error as any).name = 'CorsError';
    (error as any).status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-Id',
    'X-User-Role',
    'X-Product-Key',
    'X-User-Email',
    'X-User-Id'
  ]
});

/**
 * CSRF and Origin Validation Middleware for Cookie-Authenticated State-Changing Requests.
 * 
 * Protects state-changing endpoints (POST, PATCH, PUT, DELETE) against cross-site request forgery.
 * Validates the browser Origin (or Referer) header against the trusted origin allowlist.
 */
export const csrfOriginProtection = (req: Request, res: Response, next: NextFunction) => {
  // Safe HTTP read methods are exempt from CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  if (origin) {
    if (!validateOrigin(origin)) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'CSRF_ORIGIN_REJECTED',
        message: `Cross-Origin request blocked: Origin '${origin}' is unauthorized.`
      });
    }
  }

  // Fallback check on Referer header if Origin is absent
  const referer = req.headers.referer;
  if (!origin && referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!validateOrigin(refererOrigin)) {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'CSRF_REFERER_REJECTED',
          message: `Cross-Origin request blocked: Referer '${refererOrigin}' is unauthorized.`
        });
      }
    } catch {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'CSRF_REFERER_INVALID',
        message: 'Malformed Referer header rejected.'
      });
    }
  }

  next();
};
