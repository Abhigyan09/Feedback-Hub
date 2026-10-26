import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from workspace root or server folder
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const DEV_DEFAULT_ACCESS_SECRET = 'dev_jwt_access_secret_super_secure_512_bit_key_for_testing_only';
const DEV_DEFAULT_REFRESH_SECRET = 'dev_jwt_refresh_secret_super_secure_512_bit_key_for_testing_only';
const DEV_DEFAULT_ENCRYPTION_KEY = '4f9b2d6e8a1c3e5f7a9b0c2d4e6f8a1c3e5f7a9b0c2d4e6f8a1c3e5f7a9b0c2d';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres_secure_password@localhost:5432/feedback_hub'),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  ENCRYPTION_KEY_AES256: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional()
});

const parsed = rawEnvSchema.safeParse(process.env);
if (!parsed.success) {
  const formattedErrors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
  throw new Error(`[CRITICAL CONFIG ERROR] Invalid environment configuration: ${formattedErrors}`);
}

const rawEnv = parsed.data;
const isProduction = rawEnv.NODE_ENV === 'production';

// Strict validation for production secrets and CORS
export function validateEnvironment(envInput: Record<string, string | undefined>): void {
  const isProd = envInput.NODE_ENV === 'production';
  if (!isProd) return;

  if (!envInput.JWT_ACCESS_SECRET || envInput.JWT_ACCESS_SECRET === DEV_DEFAULT_ACCESS_SECRET) {
    throw new Error(
      '[CRITICAL CONFIG ERROR] Missing or default JWT_ACCESS_SECRET in production. Set a cryptographically secure 512-bit hex secret (e.g. openssl rand -hex 64).'
    );
  }
  if ((envInput.JWT_ACCESS_SECRET || '').length < 32) {
    throw new Error(
      '[CRITICAL CONFIG ERROR] JWT_ACCESS_SECRET must be at least 32 characters long in production.'
    );
  }
  if (!envInput.JWT_REFRESH_SECRET || envInput.JWT_REFRESH_SECRET === DEV_DEFAULT_REFRESH_SECRET) {
    throw new Error(
      '[CRITICAL CONFIG ERROR] Missing or default JWT_REFRESH_SECRET in production. Set a cryptographically secure 512-bit hex secret (e.g. openssl rand -hex 64).'
    );
  }
  if ((envInput.JWT_REFRESH_SECRET || '').length < 32) {
    throw new Error(
      '[CRITICAL CONFIG ERROR] JWT_REFRESH_SECRET must be at least 32 characters long in production.'
    );
  }
  if (!envInput.ENCRYPTION_KEY_AES256 || envInput.ENCRYPTION_KEY_AES256 === DEV_DEFAULT_ENCRYPTION_KEY) {
    throw new Error(
      '[CRITICAL CONFIG ERROR] Missing or default ENCRYPTION_KEY_AES256 in production. Set a 256-bit (64 hex characters) key.'
    );
  }
  if (envInput.CORS_ALLOWED_ORIGINS && envInput.CORS_ALLOWED_ORIGINS.includes('*')) {
    throw new Error(
      '[CRITICAL CONFIG ERROR] Wildcard CORS origin (*) is strictly forbidden in production with credentials. Specify explicit allowed domains.'
    );
  }
}

if (isProduction) {
  validateEnvironment(process.env);
}

const jwtAccessSecret = rawEnv.JWT_ACCESS_SECRET || DEV_DEFAULT_ACCESS_SECRET;
const jwtRefreshSecret = rawEnv.JWT_REFRESH_SECRET || DEV_DEFAULT_REFRESH_SECRET;
const encryptionKey = rawEnv.ENCRYPTION_KEY_AES256 || DEV_DEFAULT_ENCRYPTION_KEY;
const corsOrigins = rawEnv.CORS_ALLOWED_ORIGINS
  ? rawEnv.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:5173'];

export const ENV = {
  NODE_ENV: rawEnv.NODE_ENV,
  PORT: rawEnv.PORT,
  DATABASE_URL: rawEnv.DATABASE_URL,
  JWT_ACCESS_SECRET: jwtAccessSecret,
  JWT_SECRET: jwtAccessSecret, // Backwards compatibility alias
  JWT_REFRESH_SECRET: jwtRefreshSecret,
  JWT_ACCESS_EXPIRY: rawEnv.JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY: rawEnv.JWT_REFRESH_EXPIRY,
  ENCRYPTION_KEY: encryptionKey,
  CORS_ORIGIN: corsOrigins
};
