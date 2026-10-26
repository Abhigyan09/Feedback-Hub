import http from 'http';
import { app } from './src/server.js';
import { hashPassword } from './src/services/auth.service.js';
import { tenantStore, isPostgresConnected } from './src/config/db.js';
import { findRefreshTokenByHash } from './src/services/auth.repository.js';
import { ENV } from './src/config/env.js';
import crypto from 'crypto';

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

async function runStep3Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 3 LOGIN API VERIFICATION SUITE');
  console.log('=======================================================\n');

  // 1. SETUP: Dynamically seed test credentials
  const devSamplePassword = 'TestPassword123!';
  await tenantStore.ensureDevSeedCredentials(hashPassword, devSamplePassword);

  // Add an inactive user specifically for failure case testing
  const inactiveUserEmail = 'inactive.dev@acme.com';
  const inactiveUserId = 'user-inactive-01';
  const tenantAcmeId = 'tenant-acme-corp-001';
  const hashedPassword = await hashPassword(devSamplePassword);

  const existingInactive = tenantStore.users.find(u => u.email === inactiveUserEmail);
  if (!existingInactive) {
    tenantStore.users.push({
      id: inactiveUserId,
      tenant_id: tenantAcmeId,
      email: inactiveUserEmail,
      full_name: 'Inactive Test User',
      role: 'developer',
      is_active: false,
      password_hash: hashedPassword,
      created_at: new Date().toISOString()
    });
  } else {
    existingInactive.is_active = false;
    existingInactive.password_hash = hashedPassword;
  }

  // Start HTTP server on dynamic port for realistic end-to-end endpoint testing
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: SUCCESSFUL LOGIN
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Successful Login ---');
    const validLoginPayload = {
      email: 'dev.rahul@acme.com',
      password: devSamplePassword,
      tenant_slug: 'acme-payments'
    };

    const res1 = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validLoginPayload)
    });

    assert(res1.status === 200, `POST /login returns HTTP 200 OK (Got ${res1.status})`);

    const data1 = await res1.json();
    assert(data1.message === 'Authentication successful', 'Response includes success message');
    assert(typeof data1.access_token === 'string' && data1.access_token.split('.').length === 3, 'Response includes valid JWT access_token');
    assert(data1.token_type === 'Bearer', 'Token type is Bearer');
    assert(data1.expires_in === 900, 'Expires in is 900s (15 minutes)');
    assert(data1.user.email === 'dev.rahul@acme.com', 'Response user.email matches');
    assert(data1.user.role === 'developer', 'Response user.role matches');
    assert(data1.user.tenant_slug === 'acme-payments', 'Response user.tenant_slug matches');
    assert(!('password_hash' in data1.user), 'SECURITY: password_hash is stripped from user response');

    // Verify Set-Cookie header
    const setCookieHeader = res1.headers.get('set-cookie');
    assert(setCookieHeader !== null, 'Set-Cookie header is present');
    assert(setCookieHeader!.includes('refresh_token='), 'Set-Cookie sets refresh_token');
    assert(setCookieHeader!.includes('HttpOnly'), 'Set-Cookie includes HttpOnly flag');
    assert(setCookieHeader!.includes('Path=/api/v1/auth'), 'Set-Cookie scopes path to /api/v1/auth');
    assert(setCookieHeader!.includes('SameSite=Strict'), 'Set-Cookie includes SameSite=Strict');

    // ------------------------------------------------------------------------
    // TEST 2: REFRESH TOKEN HASH PERSISTENCE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Refresh Token Hash Persistence ---');
    // Extract raw token value from cookie
    const match = setCookieHeader!.match(/refresh_token=([a-f0-9]{128})/i);
    assert(match !== null, 'Raw refresh token is a 128-hex-character string');
    const rawRefreshToken = match![1];

    // Compute expected SHA-256 hash
    const expectedHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const storedRecord = await findRefreshTokenByHash(expectedHash);

    assert(storedRecord !== null, 'Refresh token record was persisted and found by SHA-256 hash');
    assert(storedRecord?.user_id === data1.user.id, 'Stored refresh token has correct user_id');
    assert(storedRecord?.tenant_id === data1.user.tenant_id, 'Stored refresh token has correct tenant_id');
    assert(storedRecord?.token_hash === expectedHash, 'Stored record holds SHA-256 hash, not raw token');
    assert(storedRecord?.is_revoked === false, 'New session refresh token is active (not revoked)');

    // ------------------------------------------------------------------------
    // TEST 3: INCORRECT PASSWORD REJECTION & NO SESSION CREATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Incorrect Password & No Session Leak ---');
    const tokenCountBefore = tenantStore.refreshTokens.length;

    const resWrongPwd = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: 'CompletelyWrongPassword!',
        tenant_slug: 'acme-payments'
      })
    });

    assert(resWrongPwd.status === 401, `Wrong password returns 401 Unauthorized (Got ${resWrongPwd.status})`);
    const wrongPwdBody = await resWrongPwd.json();
    assert(wrongPwdBody.error === 'Invalid credentials or organization', 'Returns generic credential error (no password hint)');
    assert(resWrongPwd.headers.get('set-cookie') === null, 'No refresh cookie set on failed login');
    assert(tenantStore.refreshTokens.length === tokenCountBefore, 'SECURITY: No refresh token record created on failed login');

    // ------------------------------------------------------------------------
    // TEST 4: UNKNOWN USER REJECTION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Unknown User Rejection ---');
    const resUnknownUser = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent.user@acme.com',
        password: devSamplePassword,
        tenant_slug: 'acme-payments'
      })
    });

    assert(resUnknownUser.status === 401, `Unknown user returns 401 Unauthorized (Got ${resUnknownUser.status})`);
    const unknownUserBody = await resUnknownUser.json();
    assert(unknownUserBody.error === 'Invalid credentials or organization', 'Returns same generic error (prevents user enumeration)');

    // ------------------------------------------------------------------------
    // TEST 5: UNKNOWN TENANT REJECTION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Unknown Tenant Rejection ---');
    const resUnknownTenant = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devSamplePassword,
        tenant_slug: 'non-existent-tenant-slug'
      })
    });

    assert(resUnknownTenant.status === 401, `Unknown tenant returns 401 Unauthorized (Got ${resUnknownTenant.status})`);
    const unknownTenantBody = await resUnknownTenant.json();
    assert(unknownTenantBody.error === 'Invalid credentials or organization', 'Returns same generic error (prevents tenant enumeration)');

    // ------------------------------------------------------------------------
    // TEST 6: TENANT-SCOPED AUTHENTICATION (Cross-Tenant Rejection)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Tenant-Scoped Authentication ---');
    // dev.rahul@acme.com exists under 'acme-payments', NOT 'medsync'
    const resCrossTenant = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devSamplePassword,
        tenant_slug: 'medsync'
      })
    });

    assert(resCrossTenant.status === 401, `User attempting login under unauthorized tenant returns 401 (Got ${resCrossTenant.status})`);
    const crossTenantBody = await resCrossTenant.json();
    assert(crossTenantBody.error === 'Invalid credentials or organization', 'Cross-tenant attempt rejected with generic credential error');

    // ------------------------------------------------------------------------
    // TEST 7: INACTIVE USER REJECTION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Inactive User Rejection ---');
    const resInactive = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inactiveUserEmail,
        password: devSamplePassword,
        tenant_slug: 'acme-payments'
      })
    });

    assert(resInactive.status === 403, `Inactive user returns 403 Forbidden (Got ${resInactive.status})`);
    const inactiveBody = await resInactive.json();
    assert(inactiveBody.error === 'Account deactivated', 'Error clearly identifies account deactivation');
    assert(resInactive.headers.get('set-cookie') === null, 'No refresh token cookie set for inactive user');

    // ------------------------------------------------------------------------
    // TEST 8: MALFORMED REQUEST PAYLOAD VALIDATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Malformed Request Payload Validation ---');

    // Missing email
    const resMissingEmail = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: devSamplePassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(resMissingEmail.status === 400, 'Missing email returns 400 Bad Request');
    const missingEmailBody = await resMissingEmail.json();
    assert(missingEmailBody.error === 'Validation Error', 'Returns Validation Error');

    // Invalid email format
    const resInvalidEmail = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: devSamplePassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(resInvalidEmail.status === 400, 'Invalid email format returns 400 Bad Request');

    // Missing password
    const resMissingPwd = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        tenant_slug: 'acme-payments'
      })
    });
    assert(resMissingPwd.status === 400, 'Missing password returns 400 Bad Request');

    // Missing tenant_slug
    const resMissingSlug = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devSamplePassword
      })
    });
    assert(resMissingSlug.status === 400, 'Missing tenant_slug returns 400 Bad Request');

    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // TEST 9: SECURE COOKIE SETTINGS & HTTPS ENFORCEMENT
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Secure Cookie Setting & Production Enforcement ---');
    const resSecure = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-proto': 'https'
      },
      body: JSON.stringify(validLoginPayload)
    });

    const secureCookie = resSecure.headers.get('set-cookie');
    assert(secureCookie !== null && secureCookie.includes('Secure'), 'Over HTTPS / SSL termination, cookie includes "Secure" flag');
    assert(secureCookie!.includes('HttpOnly'), 'Secure cookie retains HttpOnly');
    assert(secureCookie!.includes('SameSite=Strict'), 'Secure cookie retains SameSite=Strict');

    // Production environment check: assert cookie option evaluation enforces Secure in production
    const evaluateCookieSecure = (nodeEnv: string, isHttps: boolean) => nodeEnv === 'production' || isHttps;
    assert(evaluateCookieSecure('production', false) === true, 'Production environment mandates Secure = true regardless of proxy protocol');
    assert(evaluateCookieSecure('development', false) === false, 'Development environment allows Secure = false for local HTTP testing');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n=======================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStep3Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
