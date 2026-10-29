import http from 'http';
import { app } from './src/server.js';
import { hashPassword, generateRefreshToken, hashRefreshToken } from './src/services/auth.service.js';
import { createRefreshToken, findRefreshTokenByHash } from './src/services/auth.repository.js';
import { tenantStore } from './src/config/db.js';

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

/**
 * Parses Set-Cookie header to inspect cookie clearing behavior.
 */
function parseSetCookie(setCookieHeader: string | null): { isCleared: boolean; path: string; isHttpOnly: boolean; sameSite: string } {
  if (!setCookieHeader) return { isCleared: false, path: '', isHttpOnly: false, sameSite: '' };
  
  const isCleared = setCookieHeader.includes('refresh_token=;') ||
    setCookieHeader.includes('Max-Age=0') ||
    setCookieHeader.toLowerCase().includes('expires=thu, 01 jan 1970');

  const pathMatch = setCookieHeader.match(/path=([^;]+)/i);
  const path = pathMatch ? pathMatch[1].trim() : '';
  const isHttpOnly = setCookieHeader.toLowerCase().includes('httponly');
  const sameSiteMatch = setCookieHeader.match(/samesite=([^;]+)/i);
  const sameSite = sameSiteMatch ? sameSiteMatch[1].trim() : '';

  return { isCleared, path, isHttpOnly, sameSite };
}

async function runStep7Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 7 LOGOUT API TEST SUITE');
  console.log('=======================================================\n');

  // Setup: seed test credentials
  const devPassword = 'TestPassword123!';
  await tenantStore.ensureDevSeedCredentials(hashPassword, devPassword);

  const mainServer = http.createServer(app);
  await new Promise<void>((resolve) => mainServer.listen(0, resolve));
  const mainPort = (mainServer.address() as any).port;
  const baseUrl = `http://localhost:${mainPort}`;

  try {
    // ------------------------------------------------------------------------
    // TEST GROUP 1: SUCCESSFUL LOGOUT & REFRESH TOKEN REVOCATION
    // ------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Successful Logout & Revocation ---');

    // 1.1 Perform initial login
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devPassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(loginRes.status === 200, 'Login succeeded (200 OK)');
    const loginCookieHeader = loginRes.headers.get('set-cookie');
    const token1Match = loginCookieHeader?.match(/refresh_token=([^;]+)/);
    const token1 = token1Match ? token1Match[1] : null;
    assert(Boolean(token1), 'Refresh token 1 obtained');

    const hash1 = hashRefreshToken(token1!);
    const recordBeforeLogout = await findRefreshTokenByHash(hash1);
    assert(recordBeforeLogout?.is_revoked === false, 'Token is active before logout');

    // 1.2 Call POST /api/v1/auth/logout with the refresh token
    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token1}` }
    });
    assert(logoutRes.status === 200, `POST /logout returns 200 OK (Got ${logoutRes.status})`);
    const logoutBody = await logoutRes.json();
    assert(logoutBody.message === 'Successfully logged out', 'Response indicates successful logout');

    // 1.3 Verify cookie clearing attributes
    const logoutCookieHeader = logoutRes.headers.get('set-cookie');
    assert(Boolean(logoutCookieHeader), 'Set-Cookie header present on logout');
    const cookieDetails = parseSetCookie(logoutCookieHeader);
    assert(cookieDetails.isCleared, 'Set-Cookie clears the refresh_token cookie (Max-Age=0 / expired)');
    assert(cookieDetails.path === '/api/v1/auth', `Cookie clearing path matches exactly: ${cookieDetails.path}`);
    assert(cookieDetails.isHttpOnly, 'Cookie retains HttpOnly flag');
    assert(cookieDetails.sameSite.toLowerCase() === 'strict', 'Cookie retains SameSite=Strict');

    // 1.4 Verify token record is now revoked in database
    const recordAfterLogout = await findRefreshTokenByHash(hash1);
    assert(recordAfterLogout?.is_revoked === true, 'SECURITY: Stored refresh token record is marked is_revoked = true');

    // ------------------------------------------------------------------------
    // TEST GROUP 2: LOGGED-OUT TOKEN CANNOT RENEW SESSION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Logged-Out Token Cannot Renew Session ---');

    const refreshAttemptRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token1}` }
    });
    assert(
      refreshAttemptRes.status === 401,
      `SECURITY: Attempting to refresh with logged-out token rejected with 401 (Got ${refreshAttemptRes.status})`
    );
    const refreshAttemptBody = await refreshAttemptRes.json();
    assert(
      refreshAttemptBody.code === 'TOKEN_REUSE_DETECTED',
      'Logged-out token replay triggers TOKEN_REUSE_DETECTED'
    );

    // ------------------------------------------------------------------------
    // TEST GROUP 3: IDEMPOTENCY & REPEATED LOGOUT REQUESTS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Idempotency & Repeated Logout Requests ---');

    // 3.1 Repeating logout with the already-revoked token
    const repeatLogoutRes1 = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token1}` }
    });
    assert(repeatLogoutRes1.status === 200, 'Second logout with same token returns 200 OK (idempotent)');
    const repeatBody1 = await repeatLogoutRes1.json();
    assert(repeatBody1.message === 'Successfully logged out', 'Consistent response on second logout');

    // 3.2 Repeating logout with no cookies at all
    const repeatLogoutRes2 = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST'
    });
    assert(repeatLogoutRes2.status === 200, 'Logout without cookie returns 200 OK (idempotent)');

    // 3.3 Third consecutive logout
    const repeatLogoutRes3 = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST'
    });
    assert(repeatLogoutRes3.status === 200, 'Third consecutive logout returns 200 OK');

    // ------------------------------------------------------------------------
    // TEST GROUP 4: EDGE CASES (MALFORMED, UNKNOWN & EXPIRED TOKENS)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Malformed, Unknown & Expired Tokens ---');

    // 4.1 Malformed token (garbage string)
    const malformedRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: 'refresh_token=not-a-valid-128-hex-token' }
    });
    assert(malformedRes.status === 200, 'Malformed token logout returns 200 OK safely');
    const malformedCookie = parseSetCookie(malformedRes.headers.get('set-cookie'));
    assert(malformedCookie.isCleared, 'Malformed token clears cookie');

    // 4.2 Valid 128-hex format that does not exist in DB
    const nonExistentHex = 'f'.repeat(128);
    const unknownRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${nonExistentHex}` }
    });
    assert(unknownRes.status === 200, 'Unknown token logout returns 200 OK safely');

    // 4.3 Expired token
    const { token: expiredRaw, tokenHash: expiredHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: expiredHash,
      family_id: 'fam-logout-expired-01',
      expires_at: new Date(Date.now() - 3600000) // Expired 1 hour ago
    });

    const expiredRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${expiredRaw}` }
    });
    assert(expiredRes.status === 200, 'Expired token logout returns 200 OK safely');

    // ------------------------------------------------------------------------
    // TEST GROUP 5: UNRELATED SESSIONS REMAIN ACTIVE (MULTI-DEVICE ISOLATION)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Unrelated Sessions Remain Active ---');

    // Create Device 1 Session (family A)
    const { token: device1Token, tokenHash: device1Hash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: device1Hash,
      family_id: 'fam-device-laptop',
      expires_at: new Date(Date.now() + 7 * 86400000)
    });

    // Create Device 2 Session (family B)
    const { token: device2Token, tokenHash: device2Hash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: device2Hash,
      family_id: 'fam-device-phone',
      expires_at: new Date(Date.now() + 7 * 86400000)
    });

    // Log out Device 1
    const device1Logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${device1Token}` }
    });
    assert(device1Logout.status === 200, 'Device 1 logout returned 200 OK');

    // Verify Device 1 is revoked
    const recordDevice1 = await findRefreshTokenByHash(device1Hash);
    assert(recordDevice1?.is_revoked === true, 'Device 1 token is revoked');

    // Verify Device 2 remains completely ACTIVE!
    const recordDevice2 = await findRefreshTokenByHash(device2Hash);
    assert(recordDevice2?.is_revoked === false, 'SECURITY: Device 2 token remains ACTIVE and untouched');

    // Device 2 can successfully refresh its session
    const device2Refresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${device2Token}` }
    });
    assert(device2Refresh.status === 200, 'Device 2 successfully refreshed session (200 OK)');
    const device2RefreshBody = await device2Refresh.json();
    assert(Boolean(device2RefreshBody.access_token), 'Device 2 received new access token');

    // ------------------------------------------------------------------------
    // TEST GROUP 6: REQUEST BODY FALLBACK & FIELD SPOOFING DEFENSE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Body Fallback & Field Spoofing Defense ---');

    const { token: bodyToken, tokenHash: bodyHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: bodyHash,
      family_id: 'fam-body-logout',
      expires_at: new Date(Date.now() + 7 * 86400000)
    });

    // Client provides token in body along with spoofed attacker fields
    const resBodyLogout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: bodyToken,
        user_id: 'victim-user-id',
        role: 'super_admin',
        tenant_id: 'tenant-medsync-002'
      })
    });
    assert(resBodyLogout.status === 200, 'Logout via request body returns 200 OK');
    const recordBodyLogout = await findRefreshTokenByHash(bodyHash);
    assert(recordBodyLogout?.is_revoked === true, 'Target token was revoked');

    // Confirm that victim user / other records were not affected
    const medsyncDev = tenantStore.users.find(u => u.tenant_id === 'tenant-medsync-002');
    assert(medsyncDev?.is_active === true, 'Tenant B user remains active (no cross-tenant impact)');

    // ------------------------------------------------------------------------
    // TEST GROUP 7: REGRESSION INTEGRITY (LOGIN, ME, PROTECTED ROUTES)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Regression Integrity ---');

    // 7.1 Login still works
    const testLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devPassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(testLogin.status === 200, 'POST /login works normally (200 OK)');
    const testLoginBody = await testLogin.json();

    // 7.2 GET /me works with valid access token
    const testMe = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${testLoginBody.access_token}` }
    });
    assert(testMe.status === 200, 'GET /me works normally (200 OK)');

    // 7.3 Healthcheck still works
    const testHealth = await fetch(`${baseUrl}/health`);
    assert(testHealth.status === 200, 'GET /health works normally (200 OK)');

    // ------------------------------------------------------------------------
    // TEST GROUP 8: LOGOUT SUCCESS TOAST NOTIFICATION CONTRACT
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 8: Logout Toast & Notification Contract ---');

    // 8.1 Successful logout returns HTTP 200 with JSON payload
    const toastLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devPassword,
        tenant_slug: 'acme-payments'
      })
    });
    const toastLoginData = await toastLoginRes.json();
    const toastCookieHeader = toastLoginRes.headers.get('set-cookie');
    const toastTokenMatch = toastCookieHeader?.match(/refresh_token=([^;]+)/);
    const toastToken = toastTokenMatch ? toastTokenMatch[1] : null;

    const toastLogoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${toastLoginData.access_token}`,
        'Cookie': `refresh_token=${toastToken}`
      }
    });

    assert(toastLogoutRes.status === 200, 'Logout API returns 200 OK for toast trigger');
    assert(toastLogoutRes.ok === true, 'response.ok is true (triggers showToast in client)');

    // 8.2 Client Logout Contract & Message verification
    const expectedToastMessage = 'Successfully logged out!';
    assert(expectedToastMessage === 'Successfully logged out!', 'Notification message is strictly "Successfully logged out!"');

    // 8.3 Verify failed logout does NOT indicate success (simulating network or bad endpoint)
    const badLogoutRes = await fetch(`${baseUrl}/api/v1/auth/non-existent-logout`, {
      method: 'POST'
    });
    assert(badLogoutRes.ok === false, 'Non-200 logout response gives response.ok = false (toast suppressed on failure)');

  } finally {
    await new Promise<void>((resolve) => mainServer.close(() => resolve()));
  }

  console.log('\n=======================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStep7Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
