import http from 'http';
import { app } from './src/server.js';
import { hashPassword } from './src/services/auth.service.js';
import { tenantStore } from './src/config/db.js';
import {
  createPasswordResetToken,
  findRefreshTokenByHash,
  createRefreshToken
} from './src/services/auth.repository.js';
import { getLastSentResetEmail } from './src/services/email.service.js';
import { generateRefreshToken } from './src/services/auth.service.js';
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

async function runStep10Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 10 FORGOT & RESET PASSWORD TEST SUITE');
  console.log('=======================================================\n');

  // 1. SETUP: Initialize seed credentials
  const initialPassword = 'InitialPassword123!';
  await tenantStore.ensureDevSeedCredentials(hashPassword, initialPassword);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  const testUserEmail = 'dev.rahul@acme.com';
  const tenantSlug = 'acme-payments';

  try {
    // ------------------------------------------------------------------------
    // TEST GROUP 1: FORGOT PASSWORD ENDPOINT & ANTI-ENUMERATION
    // ------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Forgot Password & Anti-Enumeration ---');

    // 1.1 Request password reset for existing user
    const res1 = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, tenant_slug: tenantSlug })
    });

    assert(res1.status === 200, `POST /forgot-password returns 200 OK (Got ${res1.status})`);
    const data1 = await res1.json();
    assert(
      data1.message === 'If an account matches that email, a password reset link has been dispatched.',
      'Returns generic safe message for existing account'
    );

    const sentEmail1 = getLastSentResetEmail();
    assert(sentEmail1 !== null, 'Reset email was dispatched by email service');
    assert(sentEmail1?.toEmail === testUserEmail, `Email dispatched to correct recipient: ${testUserEmail}`);
    assert(typeof sentEmail1?.resetToken === 'string' && sentEmail1?.resetToken.length === 64, 'Token has 64-char (256-bit) entropy');
    assert(sentEmail1?.resetLink.includes('token='), 'Reset link contains token query param');

    // 1.2 Anti-enumeration: Non-existent email returns IDENTICAL 200 OK
    const resNonExistent = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent.user.999@acme.com', tenant_slug: tenantSlug })
    });

    assert(resNonExistent.status === 200, `Non-existent user returns 200 OK (Got ${resNonExistent.status})`);
    const dataNonExistent = await resNonExistent.json();
    assert(
      dataNonExistent.message === data1.message,
      'SECURITY: Generic message is strictly identical between existing and non-existing accounts'
    );

    // 1.3 Anti-enumeration: Non-existent tenant returns IDENTICAL 200 OK
    const resNonExistentTenant = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, tenant_slug: 'ghost-tenant-404' })
    });

    assert(resNonExistentTenant.status === 200, `Non-existent tenant returns 200 OK (Got ${resNonExistentTenant.status})`);
    const dataNonExistentTenant = await resNonExistentTenant.json();
    assert(
      dataNonExistentTenant.message === data1.message,
      'SECURITY: Non-existent tenant returns identical generic anti-enumeration response'
    );

    // 1.4 Route alias check: /api/auth/forgot-password works identically
    const resAlias = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail })
    });
    assert(resAlias.status === 200, `POST /api/auth/forgot-password (alias) returns 200 OK (Got ${resAlias.status})`);

    // ------------------------------------------------------------------------
    // TEST GROUP 2: SUCCESSFUL PASSWORD RESET FLOW
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Successful Password Reset Flow ---');

    // Capture the generated valid token from Test 1.1
    const validResetToken = sentEmail1!.resetToken;
    const newPassword = 'BrandNewSecurePassword2026!';

    // Submit password reset
    const resReset = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: validResetToken,
        new_password: newPassword
      })
    });

    assert(resReset.status === 200, `POST /reset-password returns 200 OK (Got ${resReset.status})`);
    const dataReset = await resReset.json();
    assert(dataReset.message.includes('successfully reset'), 'Response contains success confirmation');

    // Verify old password no longer works
    const resOldLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: initialPassword,
        tenant_slug: tenantSlug
      })
    });
    assert(resOldLogin.status === 401, `Old password fails with 401 Unauthorized (Got ${resOldLogin.status})`);

    // Verify new password works for login
    const resNewLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: newPassword,
        tenant_slug: tenantSlug
      })
    });
    assert(resNewLogin.status === 200, `New password successfully logs in with 200 OK (Got ${resNewLogin.status})`);
    const newLoginData = await resNewLogin.json();
    assert(typeof newLoginData.access_token === 'string', 'Login returns new valid access token');

    // ------------------------------------------------------------------------
    // TEST GROUP 3: SINGLE-USE ENFORCEMENT (REPLAY DEFENSE)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Single-Use Enforcement ---');

    // Attempting to use the SAME token a second time must fail
    const resReused = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: validResetToken,
        new_password: 'YetAnotherPassword789!'
      })
    });

    assert(resReused.status === 400, `Reused token is rejected with 400 Bad Request (Got ${resReused.status})`);
    const dataReused = await resReused.json();
    assert(dataReused.code === 'TOKEN_ALREADY_USED', `Error code is TOKEN_ALREADY_USED (Got ${dataReused.code})`);

    // ------------------------------------------------------------------------
    // TEST GROUP 4: TOKEN EXPIRATION ENFORCEMENT
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Token Expiration Enforcement ---');

    // Create an expired reset token directly
    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
    const userObj = tenantStore.users.find(u => u.email === testUserEmail)!;

    await createPasswordResetToken({
      user_id: userObj.id,
      tenant_id: userObj.tenant_id,
      token_hash: expiredHash,
      expires_at: new Date(Date.now() - 60 * 1000) // Expired 1 minute ago
    });

    const resExpired = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: expiredRawToken,
        new_password: 'ExpiredTokenAttemptPassword1!'
      })
    });

    assert(resExpired.status === 400, `Expired reset token rejected with 400 Bad Request (Got ${resExpired.status})`);
    const dataExpired = await resExpired.json();
    assert(dataExpired.code === 'TOKEN_EXPIRED', `Error code is TOKEN_EXPIRED (Got ${dataExpired.code})`);

    // ------------------------------------------------------------------------
    // TEST GROUP 5: MALFORMED & UNKNOWN TOKEN REJECTION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Malformed & Unknown Token Rejection ---');

    // Malformed token format (not 64 hex chars)
    const resMalformed = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'invalid-non-hex-token-format',
        new_password: 'ValidPassword123!'
      })
    });
    assert(resMalformed.status === 400, `Malformed token rejected with 400 (Got ${resMalformed.status})`);

    // Unknown 64-char token (never generated)
    const unknownToken = crypto.randomBytes(32).toString('hex');
    const resUnknown = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: unknownToken,
        new_password: 'ValidPassword123!'
      })
    });
    assert(resUnknown.status === 400, `Unknown token rejected with 400 (Got ${resUnknown.status})`);
    const dataUnknown = await resUnknown.json();
    assert(dataUnknown.code === 'INVALID_TOKEN', `Error code is INVALID_TOKEN (Got ${dataUnknown.code})`);

    // Short password rejection
    const resShortPassword = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: unknownToken,
        new_password: 'short'
      })
    });
    assert(resShortPassword.status === 400, `Short password rejected with 400 Validation Error (Got ${resShortPassword.status})`);

    // ------------------------------------------------------------------------
    // TEST GROUP 6: SESSION & REFRESH TOKEN REVOCATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Session & Refresh Token Revocation ---');

    // Seed an active refresh token for user
    const { token: sessionRawToken, tokenHash: sessionHash } = generateRefreshToken();
    await createRefreshToken({
      user_id: userObj.id,
      tenant_id: userObj.tenant_id,
      token_hash: sessionHash,
      family_id: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 7 * 86400000)
    });

    const activeSessionBefore = await findRefreshTokenByHash(sessionHash);
    assert(activeSessionBefore !== null && !activeSessionBefore.is_revoked, 'Active session exists before reset');

    // Request new reset token
    const resForgot2 = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, tenant_slug: tenantSlug })
    });
    assert(resForgot2.status === 200, 'Second reset request succeeds');
    const resetToken2 = getLastSentResetEmail()!.resetToken;

    // Perform reset
    const finalPassword = 'FinalSecurePassword2026!';
    const resReset2 = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken2,
        new_password: finalPassword
      })
    });
    assert(resReset2.status === 200, 'Password reset succeeds');

    // Verify that the prior session's refresh token is now REVOKED
    const activeSessionAfter = await findRefreshTokenByHash(sessionHash);
    assert(
      activeSessionAfter?.is_revoked === true,
      'SECURITY: Prior active refresh token was REVOKED upon password reset'
    );

    // ------------------------------------------------------------------------
    // TEST GROUP 7: API ALIAS VERIFICATION (/api/auth/reset-password)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: API Prefix Alias Verification ---');
    const resForgotAlias = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail })
    });
    assert(resForgotAlias.status === 200, 'POST /api/auth/forgot-password succeeds');
    const aliasResetToken = getLastSentResetEmail()!.resetToken;

    const resResetAlias = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: aliasResetToken,
        new_password: 'AliasTestedPassword123!'
      })
    });
    assert(resResetAlias.status === 200, 'POST /api/auth/reset-password succeeds via unversioned prefix');

  } finally {
    server.close();
  }

  console.log('\n=======================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep10Tests().catch((err) => {
  console.error('[Test Execution Error]', err);
  process.exit(1);
});
