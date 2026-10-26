import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or server folder
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5001', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password@localhost:5432/feedback_hub',
  JWT_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_jwt_access_secret_super_secure_512_bit_key_for_testing_only',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY_AES256 || '4f9b2d6e8a1c3e5f7a9b0c2d4e6f8a1c3e5f7a9b0c2d4e6f8a1c3e5f7a9b0c2d',
  CORS_ORIGIN: process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:5173']
};
