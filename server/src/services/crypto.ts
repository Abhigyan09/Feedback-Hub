import crypto from 'crypto';
import { ENV } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Parse key ensuring 32 bytes
let keyBuffer: Buffer;
try {
  keyBuffer = Buffer.from(ENV.ENCRYPTION_KEY, 'hex');
  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.scryptSync(ENV.ENCRYPTION_KEY, 'salt', 32);
  }
} catch {
  keyBuffer = crypto.scryptSync(ENV.ENCRYPTION_KEY || 'default_secret', 'salt', 32);
}

export const encryptSensitiveData = (plaintext: string): string => {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Encryption failure:', err);
    return plaintext;
  }
};

export const decryptSensitiveData = (cipherPayload: string): string => {
  try {
    if (!cipherPayload.includes(':')) return cipherPayload;
    const [ivHex, tagHex, encryptedHex] = cipherPayload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[Decryption Error: Data Tampered or Invalid Key]';
  }
};
