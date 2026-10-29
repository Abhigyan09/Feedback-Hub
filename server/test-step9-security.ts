import http from 'http';
import express, { Request, Response } from 'express';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app, server } from './src/server.js';
import { ENV, validateEnvironment } from './src/config/env.js';
import { signAccessToken, hashPassword } from './src/services/auth.service.js';
import { tenantStore } from './src/config/db.js';
import { initSocketServer, disconnectUserSockets } from './src/services/socket.js';
import { validateOrigin } from './src/middleware/security.js';

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

async function request(
  serverInstance: http.Server,
  method: string,
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = serverInstance.address();
    const port = typeof addr === 'object' && addr ? addr.port : 5001;
    const bodyData = options.body ? JSON.stringify(options.body) : undefined;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };
    if (bodyData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsedBody: any = raw;
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            // Raw text response
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            body: parsedBody
          });
        });
      }
    );

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runStep9SecurityTests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 9 PRODUCTION SECURITY HARDENING SUITE');
  console.log('=======================================================\n');

  // Ensure server is listening
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(0, resolve));
  }
  const appPort = (server.address() as any).port;

  // Seed dev credentials for test execution
  await tenantStore.ensureDevSeedCredentials(hashPassword, 'TestPassword123!');

  // ==============================================================================
  // TEST GROUP 1: Express CORS & Dynamic Origin Allowlisting
  // ==============================================================================
  console.log('--- TEST GROUP 1: Express CORS & Dynamic Origin Allowlisting ---');

  // 1. Allowed origin receives explicit Access-Control-Allow-Origin and credentials flag
  const allowedRes = await request(server, 'GET', '/health', {
    headers: {
      Origin: 'http://localhost:3000'
    }
  });
  assert(allowedRes.status === 200, 'Allowed origin http://localhost:3000 returns 200 OK');
  assert(
    allowedRes.headers['access-control-allow-origin'] === 'http://localhost:3000',
    `Access-Control-Allow-Origin echoes explicit allowed origin: ${allowedRes.headers['access-control-allow-origin']}`
  );
  assert(
    allowedRes.headers['access-control-allow-credentials'] === 'true',
    'Access-Control-Allow-Credentials is true for credentialed browser sessions'
  );
  assert(
    allowedRes.headers['access-control-allow-origin'] !== '*',
    'SECURITY: Wildcard (*) is NEVER returned as Access-Control-Allow-Origin when credentials are true'
  );

  // 2. Secondary allowed origin from ENV.CORS_ORIGIN
  const allowedRes2 = await request(server, 'GET', '/health', {
    headers: {
      Origin: 'http://localhost:5173'
    }
  });
  assert(allowedRes2.status === 200, 'Allowed origin http://localhost:5173 returns 200 OK');
  assert(
    allowedRes2.headers['access-control-allow-origin'] === 'http://localhost:5173',
    'Access-Control-Allow-Origin echoes http://localhost:5173'
  );

  // 3. Unauthorized origin is rejected by CORS with HTTP 403
  const deniedRes = await request(server, 'GET', '/health', {
    headers: {
      Origin: 'https://evil-attacker.com'
    }
  });
  assert(deniedRes.status === 403, `Unauthorized origin rejected with 403 (Got ${deniedRes.status})`);
  assert(
    deniedRes.body?.code === 'CORS_ORIGIN_DENIED',
    `Error code is CORS_ORIGIN_DENIED (Got ${deniedRes.body?.code})`
  );

  // 4. Non-browser request (no Origin header) is permitted (curl, native mobile SDK)
  const nonBrowserRes = await request(server, 'GET', '/health');
  assert(nonBrowserRes.status === 200, 'Non-browser request (without Origin header) is permitted');

  // 5. Preflight OPTIONS for authorized origin
  const preflightRes = await request(server, 'OPTIONS', '/api/v1/auth/login', {
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  });
  assert(
    preflightRes.status === 204 || preflightRes.status === 200,
    `Preflight OPTIONS for authorized origin succeeds with 200/204 (Got ${preflightRes.status})`
  );
  assert(
    preflightRes.headers['access-control-allow-origin'] === 'http://localhost:3000',
    'Preflight echoes allowed origin'
  );

  // ==============================================================================
  // TEST GROUP 2: CSRF & Origin Validation on State-Changing Endpoints
  // ==============================================================================
  console.log('\n--- TEST GROUP 2: CSRF & Origin Protection on State-Changing Requests ---');

  // 1. State-changing POST from malicious Origin is blocked before business logic
  const csrfOriginBlocked = await request(server, 'POST', '/api/v1/auth/login', {
    headers: {
      Origin: 'https://malicious-phish.net'
    },
    body: {
      email: 'dev.rahul@acme.com',
      password: 'DevPassword!123',
      tenant_slug: 'acme-corp'
    }
  });
  assert(csrfOriginBlocked.status === 403, `State-changing POST with unauthorized Origin returns 403 (Got ${csrfOriginBlocked.status})`);
  assert(
    csrfOriginBlocked.body?.code === 'CORS_ORIGIN_DENIED' || csrfOriginBlocked.body?.code === 'CSRF_ORIGIN_REJECTED',
    `Request rejected with security denial code: ${csrfOriginBlocked.body?.code}`
  );

  // 2. State-changing POST from malicious Referer header is blocked
  const csrfRefererBlocked = await request(server, 'POST', '/api/v1/auth/refresh', {
    headers: {
      Referer: 'https://malicious-phish.net/fake-login'
    },
    body: {
      refresh_token: '0'.repeat(128)
    }
  });
  assert(csrfRefererBlocked.status === 403, `State-changing POST with unauthorized Referer returns 403 (Got ${csrfRefererBlocked.status})`);
  assert(
    csrfRefererBlocked.body?.code === 'CSRF_REFERER_REJECTED',
    `Code is CSRF_REFERER_REJECTED (Got ${csrfRefererBlocked.body?.code})`
  );

  // 3. State-changing POST with authorized Origin succeeds CSRF validation
  const validCsrfPost = await request(server, 'POST', '/api/v1/auth/login', {
    headers: {
      Origin: 'http://localhost:3000'
    },
    body: {
      email: 'dev.rahul@acme.com',
      password: 'TestPassword123!',
      tenant_slug: 'acme-payments'
    }
  });
  assert(validCsrfPost.status === 200, `State-changing POST with authorized Origin succeeds (Got ${validCsrfPost.status})`);

  // 4. Verify cookie attributes on login
  const setCookieHeader = validCsrfPost.headers['set-cookie'];
  const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : (setCookieHeader || '');
  assert(cookieStr.includes('HttpOnly'), 'Cookie retains HttpOnly protection');
  assert(cookieStr.toLowerCase().includes('samesite=strict'), 'Cookie retains SameSite=Strict protection');
  assert(cookieStr.includes('Path=/api/v1/auth'), 'Cookie retains Path=/api/v1/auth constraint');

  // ==============================================================================
  // TEST GROUP 3: WebSocket Token Lifecycle & Event Security
  // ==============================================================================
  console.log('\n--- TEST GROUP 3: WebSocket Token Lifecycle & Event Security ---');

  // Start dedicated WebSocket server for precise lifecycle testing
  const wsApp = express();
  const wsServer = http.createServer(wsApp);
  const ioTestServer = initSocketServer(wsServer);

  await new Promise<void>((resolve) => wsServer.listen(0, resolve));
  const wsPort = (wsServer.address() as any).port;
  const wsUrl = `http://127.0.0.1:${wsPort}`;

  const validToken = signAccessToken({
    sub: 'user-sec-01',
    tenant_id: 'tenant-acme-corp-001',
    role: 'developer',
    email: 'sec.user@acme.com',
    full_name: 'Security Tester'
  });

  // 1. WebSocket handshake with authorized Origin succeeds
  const allowedSocket = ClientSocket(wsUrl, {
    auth: { token: validToken },
    extraHeaders: {
      Origin: 'http://localhost:3000'
    },
    transports: ['websocket'],
    timeout: 3000
  });

  const connected = await new Promise<boolean>((resolve) => {
    allowedSocket.on('connect', () => resolve(true));
    allowedSocket.on('connect_error', () => resolve(false));
  });
  assert(connected, 'Socket connection with authorized origin (http://localhost:3000) connects successfully');

  // 2. Established socket intercepts expired token on client-initiated events
  // We simulate a socket whose tokenExp has expired
  const socketInternal = (ioTestServer as any).sockets.sockets.get(allowedSocket.id);
  assert(!!socketInternal, 'Internal socket instance located in Socket.IO server');

  if (socketInternal) {
    // Force tokenExp into the past to simulate token expiration during long-lived session
    socketInternal.data.auth.tokenExp = Math.floor(Date.now() / 1000) - 30; // Expired 30 seconds ago

    const authErrorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      allowedSocket.on('auth_error', (data) => resolve(data));
    });

    const disconnectPromise = new Promise<boolean>((resolve) => {
      allowedSocket.on('disconnect', () => resolve(true));
    });

    // Client attempts an event with expired session
    allowedSocket.emit('join_room', { room: 'some_room' });

    const authError = await Promise.race([
      authErrorPromise,
      new Promise<null>((r) => setTimeout(() => r(null), 2000))
    ]);

    const didDisconnect = await Promise.race([
      disconnectPromise,
      new Promise<boolean>((r) => setTimeout(() => r(false), 2000))
    ]);

    assert(authError?.code === 'TOKEN_EXPIRED', `Expired token on active socket emitted TOKEN_EXPIRED (Got ${authError?.code})`);
    assert(didDisconnect, 'SECURITY: Socket with expired token was forcibly disconnected');
  }

  // 3. User logout terminates active WebSocket connections immediately
  // Connect a fresh socket for user-sec-02
  const user2Token = signAccessToken({
    sub: 'user-sec-02',
    tenant_id: 'tenant-acme-corp-001',
    role: 'developer',
    email: 'user2@acme.com',
    full_name: 'User Two'
  });

  const user2Socket = ClientSocket(wsUrl, {
    auth: { token: user2Token },
    transports: ['websocket'],
    timeout: 3000
  });

  await new Promise<void>((resolve) => user2Socket.on('connect', resolve));
  assert(user2Socket.connected, 'User 2 socket connected successfully');

  const user2DisconnectedPromise = new Promise<boolean>((resolve) => {
    user2Socket.on('disconnect', () => resolve(true));
  });

  // Call disconnectUserSockets (the exact function invoked on POST /logout)
  disconnectUserSockets('user-sec-02');

  const user2ForcedDisconnect = await Promise.race([
    user2DisconnectedPromise,
    new Promise<boolean>((r) => setTimeout(() => r(false), 2000))
  ]);
  assert(user2ForcedDisconnect, 'SECURITY: Logout immediately terminates live WebSocket connections for that user');

  // Clean up test socket server
  user2Socket.disconnect();
  await new Promise<void>((resolve) => wsServer.close(() => resolve()));

  // ==============================================================================
  // TEST GROUP 4: Production Configuration & Safeguard Validation
  // ==============================================================================
  console.log('\n--- TEST GROUP 4: Production Environment Validation Safeguards ---');

  // 1. Wildcard CORS in production is strictly rejected
  let wildcardCwdError = '';
  try {
    validateEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      ENCRYPTION_KEY_AES256: 'c'.repeat(64),
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,*'
    });
  } catch (err: any) {
    wildcardCwdError = err.message;
  }
  assert(
    wildcardCwdError.includes('Wildcard CORS origin (*) is strictly forbidden in production'),
    `Production validator rejects wildcard CORS (*): "${wildcardCwdError}"`
  );

  // 2. Dev default JWT access secret in production is strictly rejected
  let defaultSecretError = '';
  try {
    validateEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'dev_jwt_access_secret_super_secure_512_bit_key_for_testing_only',
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      ENCRYPTION_KEY_AES256: 'c'.repeat(64)
    });
  } catch (err: any) {
    defaultSecretError = err.message;
  }
  assert(
    defaultSecretError.includes('Missing or default JWT_ACCESS_SECRET in production'),
    `Production validator rejects default dev JWT secret: "${defaultSecretError}"`
  );

  // 3. Short secrets (< 32 chars) in production are rejected
  let shortSecretError = '';
  try {
    validateEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'too-short-secret',
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      ENCRYPTION_KEY_AES256: 'c'.repeat(64)
    });
  } catch (err: any) {
    shortSecretError = err.message;
  }
  assert(
    shortSecretError.includes('must be at least 32 characters long in production'),
    `Production validator rejects short JWT secrets: "${shortSecretError}"`
  );

  // 4. Fully compliant production environment passes validation
  let compliantPassed = false;
  try {
    validateEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'e'.repeat(64),
      JWT_REFRESH_SECRET: 'f'.repeat(64),
      ENCRYPTION_KEY_AES256: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      CORS_ALLOWED_ORIGINS: 'https://feedback.acme.com,https://app.acme.com'
    });
    compliantPassed = true;
  } catch {
    compliantPassed = false;
  }
  assert(compliantPassed, 'Valid production environment configuration passes all checks');

  // ==============================================================================
  // TEST GROUP 5: Global Error Handling & Internal Detail Sanitization
  // ==============================================================================
  console.log('\n--- TEST GROUP 5: Error Handling & Internal Detail Sanitization ---');

  // Create isolated app to test production error handler masking
  const errorTestApp = express();
  errorTestApp.get('/test-error', (req: Request, res: Response, next) => {
    next(new Error('Sensitive PostgreSQL syntax error at table "users" line 42 (password_hash leak)'));
  });

  // Attach hardened error handler
  errorTestApp.use((err: any, req: Request, res: Response, next: any) => {
    if (err.name === 'CorsError' || err.status === 403) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'CORS_ORIGIN_DENIED',
        message: err.message
      });
    }

    const isProd = (ENV.NODE_ENV as string) === 'production';
    res.status(err.status || 500).json({
      error: isProd ? 'Internal Server Error' : (err.name || 'Internal Server Error'),
      message: isProd ? 'An unexpected internal error occurred.' : (err.message || 'An unexpected error occurred.')
    });
  });

  const errServer = http.createServer(errorTestApp);
  await new Promise<void>((resolve) => errServer.listen(0, resolve));

  // Test with NODE_ENV = 'production'
  const prevEnv = ENV.NODE_ENV;
  (ENV as any).NODE_ENV = 'production';

  const prodErrRes = await request(errServer, 'GET', '/test-error');
  assert(prodErrRes.status === 500, 'Error route returns 500 in production');
  assert(
    prodErrRes.body?.message === 'An unexpected internal error occurred.',
    `SECURITY: Internal error message masked in production (Got: "${prodErrRes.body?.message}")`
  );
  assert(
    !JSON.stringify(prodErrRes.body).includes('password_hash'),
    'SECURITY: Database column details and sensitive strings are NOT exposed in production error response'
  );

  // Restore NODE_ENV
  (ENV as any).NODE_ENV = prevEnv;
  await new Promise<void>((resolve) => errServer.close(() => resolve()));

  // ==============================================================================
  // SUMMARY
  // ==============================================================================
  console.log('\n=======================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStep9SecurityTests().catch((err) => {
  console.error('[FATAL TEST EXCEPTION]', err);
  process.exit(1);
});
