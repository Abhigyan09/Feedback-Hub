import {
  hashPassword,
  verifyPassword,
  needsRehash,
  signAccessToken,
  verifyAccessToken,
  tryVerifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  isValidRefreshTokenFormat,
  ARGON2_CONFIG,
  JWT_ISSUER,
  JWT_AUDIENCE
} from './src/services/auth.service.js';
import { ENV } from './src/config/env.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 1 AUTH FOUNDATION VERIFICATION SUITE');
  console.log('=======================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: ARGON2ID PASSWORD HASHING
  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Argon2id Password Hashing ---');

  const testPassword = 'SuperSecretSecurePassword!2026';
  const hash = await hashPassword(testPassword);

  assert(
    typeof hash === 'string' && hash.startsWith('$argon2id$v=19$m=65536,t=3,p=4$'),
    `Hash follows Argon2id standard with m=65536, t=3, p=4: ${hash.slice(0, 35)}...`
  );

  const hash2 = await hashPassword(testPassword);
  assert(
    hash !== hash2,
    'Two hashes of the same password produce distinct cryptographic salts'
  );

  const verifySuccess = await verifyPassword(hash, testPassword);
  assert(verifySuccess === true, 'verifyPassword returns true for correct password');

  const verifyFail = await verifyPassword(hash, 'IncorrectPassword123');
  assert(verifyFail === false, 'verifyPassword returns false for wrong password');

  const verifyCorrupted = await verifyPassword('not-a-valid-argon-hash', testPassword);
  assert(verifyCorrupted === false, 'verifyPassword handles corrupted hash safely without crashing');

  const verifyEmpty = await verifyPassword('', '');
  assert(verifyEmpty === false, 'verifyPassword handles empty inputs safely');

  let emptyHashThrew = false;
  try {
    await hashPassword('');
  } catch (err: any) {
    emptyHashThrew = true;
  }
  assert(emptyHashThrew, 'hashPassword rejects empty password string');

  let longHashThrew = false;
  try {
    await hashPassword('a'.repeat(300));
  } catch (err: any) {
    longHashThrew = true;
  }
  assert(longHashThrew, 'hashPassword rejects passwords exceeding maximum length (DoS prevention)');

  assert(needsRehash(hash) === false, 'needsRehash returns false for fresh hash with target params');

  // --------------------------------------------------------------------------
  // TEST GROUP 2: JWT ACCESS TOKEN UTILITIES
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: JWT Access Token Utilities ---');

  const mockUser = {
    sub: 'user-dev-001-uuid',
    tenant_id: 'tenant-acme-corp-001',
    role: 'developer' as const,
    email: 'dev.rahul@acme.com',
    full_name: 'Rahul Sharma'
  };

  const token = signAccessToken(mockUser);
  assert(typeof token === 'string' && token.split('.').length === 3, 'signAccessToken generates valid 3-part JWT');

  const decoded = verifyAccessToken(token);
  assert(decoded.sub === mockUser.sub, `Decoded sub matches: ${decoded.sub}`);
  assert(decoded.tenant_id === mockUser.tenant_id, `Decoded tenant_id matches: ${decoded.tenant_id}`);
  assert(decoded.role === 'developer', `Decoded role matches: ${decoded.role}`);
  assert(decoded.email === mockUser.email, `Decoded email matches: ${decoded.email}`);
  assert(decoded.type === 'access', `Decoded type is 'access': ${decoded.type}`);
  assert(decoded.iss === JWT_ISSUER, `Decoded issuer matches: ${decoded.iss}`);
  assert(decoded.aud === JWT_AUDIENCE, `Decoded audience matches: ${decoded.aud}`);

  // Tampered token test
  let tamperedThrew = false;
  try {
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64').toString()), role: 'super_admin' })).toString('base64url');
    verifyAccessToken(`${parts[0]}.${tamperedPayload}.${parts[2]}`);
  } catch (err: any) {
    tamperedThrew = true;
  }
  assert(tamperedThrew, 'verifyAccessToken rejects tampered JWT signature');

  // Expired token test
  const expiredToken = signAccessToken(mockUser, { expiresIn: -10 }); // Already expired 10s ago
  let expiredThrew = false;
  try {
    verifyAccessToken(expiredToken);
  } catch (err: any) {
    expiredThrew = err.name === 'TokenExpiredError';
  }
  assert(expiredThrew, 'verifyAccessToken rejects expired token with TokenExpiredError');

  // tryVerifyAccessToken helper test
  const safeVerifyResult = tryVerifyAccessToken(token);
  assert(safeVerifyResult.valid === true, 'tryVerifyAccessToken returns { valid: true } for valid token');

  const safeExpiredResult = tryVerifyAccessToken(expiredToken);
  assert(safeExpiredResult.valid === false && safeExpiredResult.isExpired === true, 'tryVerifyAccessToken returns { isExpired: true } for expired token');

  // Missing claim rejection
  let missingClaimThrew = false;
  try {
    signAccessToken({ ...mockUser, sub: '' });
  } catch {
    missingClaimThrew = true;
  }
  assert(missingClaimThrew, 'signAccessToken rejects payload with missing sub');

  // --------------------------------------------------------------------------
  // TEST GROUP 3: REFRESH TOKEN UTILITIES
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Refresh Token Utilities ---');

  const refreshTokenObj = generateRefreshToken();
  assert(
    typeof refreshTokenObj.token === 'string' && refreshTokenObj.token.length === 128,
    `generateRefreshToken produces 128-hex-char token (512-bit entropy): ${refreshTokenObj.token.slice(0, 20)}...`
  );

  assert(
    typeof refreshTokenObj.tokenHash === 'string' && refreshTokenObj.tokenHash.length === 64,
    `generateRefreshToken produces 64-hex-char SHA-256 hash: ${refreshTokenObj.tokenHash.slice(0, 20)}...`
  );

  assert(isValidRefreshTokenFormat(refreshTokenObj.token), 'isValidRefreshTokenFormat returns true for generated token');
  assert(!isValidRefreshTokenFormat('short-token'), 'isValidRefreshTokenFormat returns false for short token');

  const manualHash = hashRefreshToken(refreshTokenObj.token);
  assert(manualHash === refreshTokenObj.tokenHash, 'hashRefreshToken accurately matches generated tokenHash');

  const refreshTokenObj2 = generateRefreshToken();
  assert(refreshTokenObj.token !== refreshTokenObj2.token, 'Successive refresh token generations produce unique tokens');

  let emptyHashThrow = false;
  try {
    hashRefreshToken('');
  } catch {
    emptyHashThrow = true;
  }
  assert(emptyHashThrow, 'hashRefreshToken rejects empty token input');

  // --------------------------------------------------------------------------
  // TEST GROUP 4: ENVIRONMENT CONFIGURATION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Environment Configuration ---');

  assert(typeof ENV.JWT_ACCESS_SECRET === 'string' && ENV.JWT_ACCESS_SECRET.length >= 32, 'ENV.JWT_ACCESS_SECRET is valid and configured');
  assert(typeof ENV.JWT_REFRESH_SECRET === 'string' && ENV.JWT_REFRESH_SECRET.length >= 32, 'ENV.JWT_REFRESH_SECRET is valid and configured');
  assert(typeof ENV.JWT_SECRET === 'string', 'ENV.JWT_SECRET backwards compatibility alias is present');
  assert(ENV.JWT_ACCESS_EXPIRY === '15m', `ENV.JWT_ACCESS_EXPIRY has default 15m: ${ENV.JWT_ACCESS_EXPIRY}`);
  assert(ENV.JWT_REFRESH_EXPIRY === '7d', `ENV.JWT_REFRESH_EXPIRY has default 7d: ${ENV.JWT_REFRESH_EXPIRY}`);
  assert(Array.isArray(ENV.CORS_ORIGIN), 'ENV.CORS_ORIGIN is parsed into an array');

  console.log('\n=======================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
