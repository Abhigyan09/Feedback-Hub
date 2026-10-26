import argon2 from 'argon2';
import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { ENV } from '../config/env.js';
import { AccessTokenClaims, GeneratedRefreshToken, UserRole } from '../types/index.js';

// ==============================================================================
// 1. ARGON2ID PASSWORD HASHING SPECIFICATION
// Standard: RFC 9106 / OWASP Recommended Parameters
// ==============================================================================

export const ARGON2_CONFIG: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB (memory-hard against GPU/ASIC cracking)
  timeCost: 3,       // 3 iterations
  parallelism: 4     // 4 parallel threads
};

const MAX_PASSWORD_LENGTH = 256;

/**
 * Hashes a plaintext password using Argon2id with memory-hard parameters.
 * @param password Plaintext password to hash
 * @returns Standard PHC string representing the Argon2id hash
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password exceeds maximum allowed length of ${MAX_PASSWORD_LENGTH} characters`);
  }

  return argon2.hash(password, ARGON2_CONFIG);
}

/**
 * Verifies a plaintext password against a stored Argon2id hash safely.
 * Returns false on mismatched passwords or malformed/tampered hashes without throwing.
 * @param hash Stored Argon2id hash string
 * @param password Plaintext password to verify
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (typeof hash !== 'string' || typeof password !== 'string' || !hash || !password) {
    return false;
  }

  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash, invalid algorithm, or corrupted salt fails safely
    return false;
  }
}

/**
 * Checks whether an existing hash needs to be recomputed due to updated parameters.
 * @param hash Stored Argon2 hash
 */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON2_CONFIG);
  } catch {
    return true;
  }
}

// ==============================================================================
// 2. JWT ACCESS TOKEN UTILITIES
// Standard: Signed HMAC-SHA256 (HS256) with strict claims validation
// ==============================================================================

export const JWT_ISSUER = 'feedback-hub-api';
export const JWT_AUDIENCE = 'feedback-hub-client';

export interface AccessTokenInput {
  sub: string;
  tenant_id: string;
  role: UserRole;
  email: string;
  full_name: string;
}

/**
 * Signs a short-lived JWT access token containing authorized user & tenant claims.
 * @param user User identity and role context
 * @param options Optional custom expiration override
 * @returns Cryptographically signed JWT string
 */
export function signAccessToken(
  user: AccessTokenInput,
  options?: { expiresIn?: string | number }
): string {
  if (!user || !user.sub || !user.tenant_id || !user.role || !user.email) {
    throw new Error('Cannot sign access token: missing required user claims (sub, tenant_id, role, email)');
  }

  const payload: AccessTokenClaims = {
    sub: user.sub,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
    full_name: user.full_name || '',
    type: 'access'
  };

  const signOptions: SignOptions = {
    algorithm: 'HS256',
    expiresIn: (options?.expiresIn || ENV.JWT_ACCESS_EXPIRY) as any,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  };

  return jwt.sign(payload, ENV.JWT_ACCESS_SECRET, signOptions);
}

/**
 * Verifies and decodes a JWT access token.
 * Rejects expired, tampered, or incorrectly signed tokens.
 * @param token Encoded JWT string
 * @returns Verified AccessTokenClaims payload
 * @throws TokenExpiredError | JsonWebTokenError | Error
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Access token is required and must be a non-empty string');
  }

  const verifyOptions: VerifyOptions = {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  };

  const decoded = jwt.verify(token, ENV.JWT_ACCESS_SECRET, verifyOptions) as unknown as AccessTokenClaims;

  if (decoded.type !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }

  if (!decoded.sub || !decoded.tenant_id || !decoded.role || !decoded.email) {
    throw new Error('Token payload is missing required authorization claims');
  }

  return decoded;
}

/**
 * Safe verifier that returns a discriminated union result rather than throwing exceptions.
 * @param token Encoded JWT string
 */
export function tryVerifyAccessToken(
  token: string
): { valid: true; claims: AccessTokenClaims } | { valid: false; error: string; isExpired: boolean } {
  try {
    const claims = verifyAccessToken(token);
    return { valid: true, claims };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Token verification failed',
      isExpired: err.name === 'TokenExpiredError'
    };
  }
}

// ==============================================================================
// 3. REFRESH TOKEN UTILITIES
// Standard: 512-bit Cryptographically Secure Random Hex + SHA-256 Storage Hash
// ==============================================================================

/**
 * Generates a high-entropy, cryptographically random refresh token.
 * Returns the raw token for client transport and the SHA-256 hash for database storage.
 * Note: Raw refresh tokens are never persisted directly.
 */
export function generateRefreshToken(): GeneratedRefreshToken {
  // 64 random bytes = 512 bits of entropy
  const rawToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  return {
    token: rawToken,
    tokenHash
  };
}

/**
 * Computes a SHA-256 hash of a raw refresh token.
 * Used to securely query or store refresh tokens without storing plaintext credentials.
 * @param rawToken The plaintext refresh token string
 */
export function hashRefreshToken(rawToken: string): string {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    throw new Error('Raw refresh token must be a non-empty string');
  }

  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Validates whether a given string matches the expected refresh token format (128 hex chars).
 * @param token Candidate token string
 */
export function isValidRefreshTokenFormat(token: string): boolean {
  if (typeof token !== 'string') return false;
  return /^[0-9a-f]{128}$/i.test(token);
}
