import http from 'http';
import { app } from './src/server.js';
import { hashPassword, generateRefreshToken, hashRefreshToken, signAccessToken } from './src/services/auth.service.js';
import { createRefreshToken, findRefreshTokenByHash, revokeTokenFamily } from './src/services/auth.repository.js';
import { tenantStore, withTransaction } from './src/config/db.js';

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
 * Parses the refresh_token from a Set-Cookie header.
 */
function extractRefreshTokenCookie(setCookieHeader: string | null): { token: string | null; flags: string } {
  if (!setCookieHeader) return { token: null, flags: '' };
  const match = setCookieHeader.match(/refresh_token=([^;]+)/);
  return {
    token: match ? match[1] : null,
    flags: setCookieHeader
  };
}

async function runStep6Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 6 REFRESH TOKEN ROTATION TEST SUITE');
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
    // TEST GROUP 1: SUCCESSFUL LOGIN & REFRESH TOKEN ROTATION
    // ------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Successful Refresh & Single-Use Rotation ---');

    // Step 1: Perform initial login
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devPassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(loginRes.status === 200, 'Initial login succeeded (200 OK)');
    const loginCookieHeader = loginRes.headers.get('set-cookie');
    const { token: token1, flags: flags1 } = extractRefreshTokenCookie(loginCookieHeader);
    assert(Boolean(token1), 'Refresh token 1 received in Set-Cookie header');
    assert(flags1.includes('HttpOnly'), 'Cookie includes HttpOnly flag');
    assert(flags1.includes('Path=/api/v1/auth'), 'Cookie scoped to Path=/api/v1/auth');
    assert(flags1.toLowerCase().includes('samesite=strict'), 'Cookie includes SameSite=Strict');

    const hash1 = hashRefreshToken(token1!);
    const record1 = await findRefreshTokenByHash(hash1);
    assert(Boolean(record1), 'Token 1 record exists in persistence');
    assert(record1?.is_revoked === false, 'Token 1 is active (is_revoked = false)');
    const originalFamilyId = record1!.family_id;

    // Step 2: Present token 1 to /refresh
    const refreshRes1 = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token1}` }
    });
    assert(refreshRes1.status === 200, `POST /refresh with token 1 returns 200 OK (Got ${refreshRes1.status})`);
    const refreshBody1 = await refreshRes1.json();
    assert(Boolean(refreshBody1.access_token), 'Returns new signed JWT access_token');
    assert(refreshBody1.token_type === 'Bearer', 'Token type is Bearer');
    assert(refreshBody1.expires_in === 900, 'Access token expires in 900 seconds (15m)');
    assert(refreshBody1.user.email === 'dev.rahul@acme.com', 'User email verified in payload');
    assert(refreshBody1.user.role === 'developer', 'User role verified in payload');
    assert(!('refresh_token' in refreshBody1), 'SECURITY: Raw refresh token is NOT in JSON payload');

    // Step 3: Verify new refresh token 2 in Set-Cookie
    const refreshCookieHeader1 = refreshRes1.headers.get('set-cookie');
    const { token: token2, flags: flags2 } = extractRefreshTokenCookie(refreshCookieHeader1);
    assert(Boolean(token2), 'New refresh token 2 received in Set-Cookie');
    assert(token2 !== token1, 'SECURITY: Single-use rotation: Token 2 is different from Token 1');
    assert(flags2.includes('HttpOnly'), 'New cookie retains HttpOnly');
    assert(flags2.includes('Path=/api/v1/auth'), 'New cookie retains Path=/api/v1/auth');

    // Step 4: Verify persistence states of token 1 and token 2
    const updatedRecord1 = await findRefreshTokenByHash(hash1);
    assert(updatedRecord1?.is_revoked === true, 'SECURITY: Presented Token 1 is now marked is_revoked = true');
    const hash2 = hashRefreshToken(token2!);
    assert(updatedRecord1?.replaced_by_token_hash === hash2, 'Lineage tracking: Token 1 records Token 2 hash as replacement');

    const record2 = await findRefreshTokenByHash(hash2);
    assert(Boolean(record2), 'Token 2 is persisted');
    assert(record2?.is_revoked === false, 'Token 2 is active');
    assert(record2?.family_id === originalFamilyId, 'Token 2 belongs to the SAME token family');

    // ------------------------------------------------------------------------
    // TEST GROUP 2: SEQUENTIAL ROTATION (TOKEN 2 -> TOKEN 3)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Sequential Rotation (Token 2 -> Token 3) ---');

    const refreshRes2 = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token2}` }
    });
    assert(refreshRes2.status === 200, 'POST /refresh with token 2 returns 200 OK');
    const { token: token3 } = extractRefreshTokenCookie(refreshRes2.headers.get('set-cookie'));
    assert(Boolean(token3), 'Token 3 issued');
    assert(token3 !== token2 && token3 !== token1, 'Token 3 is distinct from Token 1 and Token 2');

    const hash3 = hashRefreshToken(token3!);
    const record3 = await findRefreshTokenByHash(hash3);
    assert(record3?.family_id === originalFamilyId, 'Token 3 remains in same family');
    const updatedRecord2 = await findRefreshTokenByHash(hash2);
    assert(updatedRecord2?.is_revoked === true, 'Token 2 is now revoked');
    assert(updatedRecord2?.replaced_by_token_hash === hash3, 'Token 2 records Token 3 replacement hash');

    // ------------------------------------------------------------------------
    // TEST GROUP 3: TOKEN REUSE DETECTION & FAMILY-WIDE REVOCATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Token Reuse Detection & Compromise Neutralization ---');

    // Attacker or replay sends OLD Token 1 which was already rotated
    const reuseRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token1}` }
    });
    assert(reuseRes.status === 401, `SECURITY: Replaying rotated token returns 401 Unauthorized (Got ${reuseRes.status})`);
    const reuseBody = await reuseRes.json();
    assert(reuseBody.code === 'TOKEN_REUSE_DETECTED', 'Error code is TOKEN_REUSE_DETECTED');
    assert(reuseBody.message.includes('terminated') || reuseBody.message.includes('security'), 'Message indicates session family terminated');

    // Verify Set-Cookie clears the cookie
    const reuseCookieHeader = reuseRes.headers.get('set-cookie');
    assert(
      reuseCookieHeader?.includes('refresh_token=;') ||
      reuseCookieHeader?.includes('Max-Age=0') ||
      reuseCookieHeader?.includes('expires='),
      'Set-Cookie clears the refresh_token cookie on reuse detection'
    );

    // Verify that ALL tokens in the family (including active Token 3) are now REVOKED!
    const familyRecord3 = await findRefreshTokenByHash(hash3);
    assert(familyRecord3?.is_revoked === true, 'SECURITY: Compromised Token 3 was revoked by family neutralization');

    // Any attempt to use Token 3 now fails
    const postCompromiseRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${token3}` }
    });
    assert(postCompromiseRes.status === 401, 'Token 3 can no longer be used after family compromise (401)');

    // ------------------------------------------------------------------------
    // TEST GROUP 4: MISSING, MALFORMED & UNKNOWN TOKENS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Missing, Malformed & Unknown Tokens ---');

    // 4.1 Missing cookie entirely
    const resNoCookie = await fetch(`${baseUrl}/api/v1/auth/refresh`, { method: 'POST' });
    assert(resNoCookie.status === 401, 'Missing cookie returns 401');
    const bodyNoCookie = await resNoCookie.json();
    assert(bodyNoCookie.code === 'REFRESH_TOKEN_MISSING', 'Code is REFRESH_TOKEN_MISSING');

    // 4.2 Malformed token format (not 128 hex characters)
    const resMalformed = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: 'refresh_token=bad-format-token' }
    });
    assert(resMalformed.status === 401, 'Malformed token returns 401');
    const bodyMalformed = await resMalformed.json();
    assert(bodyMalformed.code === 'REFRESH_TOKEN_INVALID', 'Code is REFRESH_TOKEN_INVALID');

    // 4.3 Valid format (128 hex chars) but token does not exist in DB
    const randomHex = 'a'.repeat(128);
    const resNotFound = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${randomHex}` }
    });
    assert(resNotFound.status === 401, 'Unknown token returns 401');
    const bodyNotFound = await resNotFound.json();
    assert(bodyNotFound.code === 'TOKEN_NOT_FOUND', 'Code is TOKEN_NOT_FOUND');

    // ------------------------------------------------------------------------
    // TEST GROUP 5: EXPIRED TOKENS & INACTIVE USERS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Expired Tokens & Inactive Users ---');

    // 5.1 Expired token
    const { token: expiredRaw, tokenHash: expiredHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: expiredHash,
      family_id: 'fam-expired-01',
      expires_at: new Date(Date.now() - 60000) // Expired 1 minute ago
    });

    const resExpired = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${expiredRaw}` }
    });
    assert(resExpired.status === 401, 'Expired refresh token returns 401');
    const bodyExpired = await resExpired.json();
    assert(bodyExpired.code === 'TOKEN_EXPIRED', 'Code is TOKEN_EXPIRED');

    // 5.2 Inactive user
    // Temporarily create a user, deactivate them, and test
    const { token: inactiveRaw, tokenHash: inactiveHash } = generateRefreshToken();
    tenantStore.users.push({
      id: 'user-deactivated-01',
      tenant_id: 'tenant-acme-corp-001',
      email: 'deactivated@acme.com',
      full_name: 'Deactivated User',
      role: 'developer',
      is_active: false,
      created_at: new Date().toISOString()
    });
    await createRefreshToken({
      user_id: 'user-deactivated-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: inactiveHash,
      family_id: 'fam-inactive-01',
      expires_at: new Date(Date.now() + 86400000)
    });

    const resInactive = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refresh_token=${inactiveRaw}` }
    });
    assert(resInactive.status === 403, 'Inactive user refresh returns 403 Forbidden');
    const bodyInactive = await resInactive.json();
    assert(bodyInactive.code === 'USER_INACTIVE', 'Code is USER_INACTIVE');

    // ------------------------------------------------------------------------
    // TEST GROUP 6: CONCURRENT REFRESH REQUESTS (RACE CONDITION DEFENSE)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Concurrent Refresh Race Condition Defense ---');

    // Generate a fresh active token
    const { token: raceRaw, tokenHash: raceHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: raceHash,
      family_id: 'fam-race-01',
      expires_at: new Date(Date.now() + 86400000)
    });

    // Fire 2 concurrent refresh requests simultaneously with the same token
    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${raceRaw}` }
      }),
      fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${raceRaw}` }
      })
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort();
    // Exactly one must succeed (200) and the other must fail (401)
    assert(
      statuses[0] === 200 && statuses[1] === 401,
      `SECURITY: Concurrency control: exactly one request succeeded (200), other rejected (401). Got: [${statuses.join(', ')}]`
    );

    // ------------------------------------------------------------------------
    // TEST GROUP 7: TRANSACTION ROLLBACK INTEGRITY
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Transaction Rollback Integrity ---');

    const { token: rollbackRaw, tokenHash: rollbackHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: rollbackHash,
      family_id: 'fam-rollback-01',
      expires_at: new Date(Date.now() + 86400000)
    });

    let rollbackErrorCaught = false;
    try {
      await withTransaction(async (client) => {
        // Create an uncommitted token inside transaction
        await createRefreshToken({
          user_id: 'user-dev-01',
          tenant_id: 'tenant-acme-corp-001',
          token_hash: 'rollback_test_token_hash_should_not_exist',
          family_id: 'fam-rollback-01',
          expires_at: new Date(Date.now() + 86400000)
        }, client);

        // Intentionally throw error to force transaction abort / rollback
        throw new Error('Simulated Database Crash During Rotation');
      });
    } catch (err: any) {
      rollbackErrorCaught = true;
      assert(err.message === 'Simulated Database Crash During Rotation', 'Transaction aborted cleanly');
    }

    assert(rollbackErrorCaught, 'Rollback exception was triggered');
    const abortedRecord = await findRefreshTokenByHash('rollback_test_token_hash_should_not_exist');
    assert(abortedRecord === null, 'SECURITY: Transaction rollback ensured uncommitted token was discarded');

    // Original token remains intact
    const originalPreRollback = await findRefreshTokenByHash(rollbackHash);
    assert(originalPreRollback !== null, 'Original token remained intact after aborted transaction');

    // ------------------------------------------------------------------------
    // TEST GROUP 8: REQUEST BODY FALLBACK SUPPORT & FIELD SPOOFING DEFENSE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 8: Body Fallback & Field Spoofing Defense ---');

    const { token: bodyRaw, tokenHash: bodyHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: 'user-dev-01',
      tenant_id: 'tenant-acme-corp-001',
      token_hash: bodyHash,
      family_id: 'fam-body-01',
      expires_at: new Date(Date.now() + 86400000)
    });

    // Client passes refresh token via request body, but attempts to spoof user_id & role:
    const resBodyFallback = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: bodyRaw,
        user_id: 'attacker-fake-id',
        role: 'super_admin',
        tenant_id: 'tenant-medsync-002'
      })
    });
    assert(resBodyFallback.status === 200, 'Refresh via request body fallback returns 200 OK');
    const bodyFallbackData = await resBodyFallback.json();
    assert(
      bodyFallbackData.user.id === 'user-dev-01',
      'SECURITY: Spoofed body user_id rejected; verified user_id (user-dev-01) preserved'
    );
    assert(
      bodyFallbackData.user.role === 'developer',
      'SECURITY: Spoofed body role rejected; verified role (developer) preserved'
    );
    assert(
      bodyFallbackData.user.tenant_id === 'tenant-acme-corp-001',
      'SECURITY: Spoofed body tenant_id rejected; verified tenant_id (tenant-acme-corp-001) preserved'
    );

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

runStep6Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
