import http from 'http';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { app } from './src/server.js';
import { authenticate, authenticateJWT } from './src/middleware/authenticate.js';
import { tenantContextMiddleware } from './src/middleware/tenantContext.js';
import { signAccessToken, hashPassword } from './src/services/auth.service.js';
import { tenantStore } from './src/config/db.js';
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

async function runStep4Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 4 AUTHENTICATION MIDDLEWARE SUITE');
  console.log('=======================================================\n');

  // Setup: seed test credentials
  const devSamplePassword = 'TestPassword123!';
  await tenantStore.ensureDevSeedCredentials(hashPassword, devSamplePassword);

  const testUser = {
    sub: 'user-dev-01',
    tenant_id: 'tenant-acme-corp-001',
    role: 'developer' as const,
    email: 'dev.rahul@acme.com',
    full_name: 'Rahul Sharma'
  };

  // Create dedicated Express test harness mounting protected test endpoints
  const testApp = express();
  testApp.use(express.json());

  // Test Route 1: Direct authenticate middleware
  testApp.get('/test/protected', authenticate, (req: Request, res: Response) => {
    res.status(200).json({
      message: 'Access granted',
      auth: req.auth
    });
  });

  // Test Route 2: Chained authenticate + tenantContextMiddleware to test spoofing overrides
  testApp.get('/test/scoped', authenticate, tenantContextMiddleware, (req: Request, res: Response) => {
    res.status(200).json({
      message: 'Scoped access granted',
      auth: req.auth
    });
  });

  // Start test server
  const testServer = http.createServer(testApp);
  await new Promise<void>((resolve) => testServer.listen(0, resolve));
  const testPort = (testServer.address() as any).port;
  const testBaseUrl = `http://localhost:${testPort}`;

  // Also start main app server to test /api/v1/auth/me and /api/v1/auth/login
  const mainServer = http.createServer(app);
  await new Promise<void>((resolve) => mainServer.listen(0, resolve));
  const mainPort = (mainServer.address() as any).port;
  const mainBaseUrl = `http://localhost:${mainPort}`;

  try {
    const validToken = signAccessToken(testUser);

    // ------------------------------------------------------------------------
    // TEST GROUP 1: MISSING & MALFORMED AUTHORIZATION HEADERS
    // ------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Missing & Malformed Headers ---');

    // Case 1: Missing Authorization header
    const resNoAuth = await fetch(`${testBaseUrl}/test/protected`);
    assert(resNoAuth.status === 401, `Missing header returns 401 Unauthorized (Got ${resNoAuth.status})`);
    const bodyNoAuth = await resNoAuth.json();
    assert(bodyNoAuth.code === 'AUTH_HEADER_MISSING', 'Error code is AUTH_HEADER_MISSING');

    // Case 2: Non-Bearer scheme (e.g. Basic auth)
    const resBasic = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' }
    });
    assert(resBasic.status === 401, 'Non-Bearer scheme returns 401');
    const bodyBasic = await resBasic.json();
    assert(bodyBasic.code === 'AUTH_HEADER_MALFORMED', 'Error code is AUTH_HEADER_MALFORMED for Basic scheme');

    // Case 3: Empty Bearer header ("Bearer ")
    const resEmptyBearer = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: 'Bearer ' }
    });
    assert(resEmptyBearer.status === 401, 'Empty Bearer token returns 401');
    const bodyEmptyBearer = await resEmptyBearer.json();
    assert(bodyEmptyBearer.code === 'AUTH_HEADER_MALFORMED', 'Error code is AUTH_HEADER_MALFORMED for empty Bearer');

    // Case 4: Extra whitespace / extra parts
    const resMultiParts = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: 'Bearer token1 token2' }
    });
    assert(resMultiParts.status === 401, 'Multi-part Bearer header returns 401 AUTH_HEADER_MALFORMED');

    // ------------------------------------------------------------------------
    // TEST GROUP 2: INVALID, TAMPERED & EXPIRED TOKENS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Invalid, Tampered & Expired Tokens ---');

    // Case 1: Random non-JWT string
    const resGarbage = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: 'Bearer not.a.real.jwt.token' }
    });
    assert(resGarbage.status === 401, 'Malformed JWT string returns 401');
    const bodyGarbage = await resGarbage.json();
    assert(bodyGarbage.code === 'TOKEN_INVALID', 'Error code is TOKEN_INVALID for malformed JWT');

    // Case 2: Tampered payload / invalid signature
    const parts = validToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), role: 'super_admin' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const resTampered = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: `Bearer ${tamperedToken}` }
    });
    assert(resTampered.status === 401, 'Tampered JWT returns 401');
    const bodyTampered = await resTampered.json();
    assert(bodyTampered.code === 'TOKEN_INVALID', 'Error code is TOKEN_INVALID for tampered JWT');

    // Case 3: Token signed with wrong secret
    const wrongSecretToken = jwt.sign(
      { ...testUser, type: 'access' },
      'wrong_unauthorized_secret_key_12345678901234567890',
      { algorithm: 'HS256', expiresIn: '15m' }
    );
    const resWrongSecret = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: `Bearer ${wrongSecretToken}` }
    });
    assert(resWrongSecret.status === 401, 'Token signed with wrong secret returns 401');
    const bodyWrongSecret = await resWrongSecret.json();
    assert(bodyWrongSecret.code === 'TOKEN_INVALID', 'Error code is TOKEN_INVALID for wrong secret');

    // Case 4: Expired token
    const expiredToken = signAccessToken(testUser, { expiresIn: -30 }); // Expired 30 seconds ago
    const resExpired = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    assert(resExpired.status === 401, 'Expired token returns 401');
    const bodyExpired = await resExpired.json();
    assert(bodyExpired.code === 'TOKEN_EXPIRED', 'Error code is TOKEN_EXPIRED');
    assert(bodyExpired.message.includes('expired'), 'Error message clearly indicates token has expired');

    // Case 5: Token missing required authorization claims
    const incompleteToken = jwt.sign(
      { sub: 'some-user', type: 'access' }, // missing tenant_id, role, email
      ENV.JWT_ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '15m', issuer: 'feedback-hub-api', audience: 'feedback-hub-client' }
    );
    const resIncomplete = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: `Bearer ${incompleteToken}` }
    });
    assert(resIncomplete.status === 401, 'Token with missing authorization claims returns 401');
    const bodyIncomplete = await resIncomplete.json();
    assert(bodyIncomplete.code === 'AUTH_FAILED', 'Error code is AUTH_FAILED for incomplete claims');

    // ------------------------------------------------------------------------
    // TEST GROUP 3: VALID TOKEN & TYPED CONTEXT ATTACHMENT
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Valid Token & Typed Auth Context ---');

    const resValid = await fetch(`${testBaseUrl}/test/protected`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    assert(resValid.status === 200, `Valid Bearer token returns 200 OK (Got ${resValid.status})`);
    const bodyValid = await resValid.json();
    assert(bodyValid.message === 'Access granted', 'Protected route returned success');
    assert(bodyValid.auth.userId === testUser.sub, `Attached auth.userId matches: ${bodyValid.auth.userId}`);
    assert(bodyValid.auth.tenantId === testUser.tenant_id, `Attached auth.tenantId matches: ${bodyValid.auth.tenantId}`);
    assert(bodyValid.auth.role === 'developer', `Attached auth.role matches: ${bodyValid.auth.role}`);
    assert(bodyValid.auth.email === testUser.email, `Attached auth.email matches: ${bodyValid.auth.email}`);
    assert(bodyValid.auth.fullName === testUser.full_name, `Attached auth.fullName matches: ${bodyValid.auth.fullName}`);

    // Test alias export: authenticateJWT
    assert(authenticateJWT === authenticate, 'authenticateJWT is exported as alias to authenticate');

    // ------------------------------------------------------------------------
    // TEST GROUP 4: RESISTANCE TO CLIENT HEADER SPOOFING
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Header Spoofing Resistance ---');

    // Attacker sends valid developer token, but attempts to spoof headers:
    // x-user-role: super_admin
    // x-tenant-id: tenant-medsync-002
    // x-user-id: fake-attacker-id
    // x-user-email: evil@attacker.com
    const resSpoofed = await fetch(`${testBaseUrl}/test/scoped`, {
      headers: {
        Authorization: `Bearer ${validToken}`,
        'x-user-role': 'super_admin',
        'x-tenant-id': 'tenant-medsync-002',
        'x-user-id': 'fake-attacker-id',
        'x-user-email': 'evil@attacker.com'
      }
    });

    assert(resSpoofed.status === 200, 'Request processed');
    const bodySpoofed = await resSpoofed.json();

    assert(
      bodySpoofed.auth.role === 'developer',
      `SECURITY: Client header x-user-role (super_admin) was rejected; verified token role (developer) preserved`
    );
    assert(
      bodySpoofed.auth.tenantId === testUser.tenant_id,
      `SECURITY: Client header x-tenant-id (tenant-medsync-002) was rejected; verified token tenant_id preserved`
    );
    assert(
      bodySpoofed.auth.userId === testUser.sub,
      `SECURITY: Client header x-user-id was rejected; verified token sub preserved`
    );
    assert(
      bodySpoofed.auth.email === testUser.email,
      `SECURITY: Client header x-user-email was rejected; verified token email preserved`
    );

    // ------------------------------------------------------------------------
    // TEST GROUP 5: ENDPOINT INTEGRATION (GET /api/v1/auth/me & POST /login)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Endpoint Integration ---');

    // 1. GET /api/v1/auth/me without token -> 401
    const resMeNoAuth = await fetch(`${mainBaseUrl}/api/v1/auth/me`);
    assert(resMeNoAuth.status === 401, 'GET /api/v1/auth/me without token returns 401 Unauthorized');

    // 2. GET /api/v1/auth/me with valid token -> 200 OK
    const resMeValid = await fetch(`${mainBaseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    assert(resMeValid.status === 200, `GET /api/v1/auth/me with valid token returns 200 OK (Got ${resMeValid.status})`);
    const bodyMe = await resMeValid.json();
    assert(bodyMe.user.email === testUser.email, 'GET /me returns verified user email');
    assert(bodyMe.user.role === testUser.role, 'GET /me returns verified user role');
    assert(bodyMe.user.tenant_id === testUser.tenant_id, 'GET /me returns verified tenant ID');

    // 3. POST /api/v1/auth/login remains public (does not require Bearer token)
    const resLogin = await fetch(`${mainBaseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: devSamplePassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(resLogin.status === 200, 'POST /api/v1/auth/login remains public and does not require an access token');

  } finally {
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
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

runStep4Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
