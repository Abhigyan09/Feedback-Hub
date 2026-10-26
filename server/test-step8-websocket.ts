import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import express from 'express';
import { initSocketServer, broadcastTicketEvent, closeSocketServer } from './src/services/socket.js';
import { signAccessToken } from './src/services/auth.service.js';
import { ENV } from './src/config/env.js';
import jwt from 'jsonwebtoken';

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

async function runStep8Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 8 WEBSOCKET & SOCKET.IO AUTH SUITE');
  console.log('=======================================================\n');

  // Start dedicated HTTP server with Socket.IO attached
  const testApp = express();
  const testServer = http.createServer(testApp);
  const ioServer = initSocketServer(testServer);

  await new Promise<void>((resolve) => testServer.listen(0, resolve));
  const port = (testServer.address() as any).port;
  const socketUrl = `http://localhost:${port}`;

  // Pre-generate tokens for test scenarios
  const tenantAId = 'tenant-acme-corp-001';
  const tenantBId = 'tenant-medsync-002';

  const devTokenA = signAccessToken({
    sub: 'user-dev-01',
    tenant_id: tenantAId,
    role: 'developer',
    email: 'dev.rahul@acme.com',
    full_name: 'Rahul Sharma'
  });

  const clientTokenA = signAccessToken({
    sub: 'user-client-01',
    tenant_id: tenantAId,
    role: 'client_user',
    email: 'operations@partner-client.com',
    full_name: 'Sarah Jenkins'
  });

  const devTokenB = signAccessToken({
    sub: 'user-medsync-dev-01',
    tenant_id: tenantBId,
    role: 'developer',
    email: 'dev.elena@medsync.io',
    full_name: 'Elena Rostova'
  });

  const expiredToken = signAccessToken(
    {
      sub: 'user-dev-01',
      tenant_id: tenantAId,
      role: 'developer',
      email: 'dev.rahul@acme.com',
      full_name: 'Rahul Sharma'
    },
    { expiresIn: -60 }
  );

  const wrongSecretToken = jwt.sign(
    {
      sub: 'user-dev-01',
      tenant_id: tenantAId,
      role: 'developer',
      email: 'dev.rahul@acme.com',
      type: 'access'
    },
    'unauthorized_random_secret_key_12345678901234567890',
    { algorithm: 'HS256', expiresIn: '15m' }
  );

  const activeSockets: ClientSocketType[] = [];

  function trackSocket(socket: ClientSocketType): ClientSocketType {
    activeSockets.push(socket);
    return socket;
  }

  try {
    // ------------------------------------------------------------------------
    // TEST GROUP 1: HANDSHAKE AUTHENTICATION REJECTION
    // ------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Handshake Authentication Rejection ---');

    // 1.1 Missing Token
    const errMissing = await new Promise<any>((resolve) => {
      const s = trackSocket(ClientSocket(socketUrl, { transports: ['websocket'], timeout: 2000 }));
      s.on('connect_error', (err) => resolve(err));
      s.on('connect', () => resolve(new Error('Unexpected connection without token')));
    });
    assert(errMissing.message.includes('Missing access token'), `Missing token rejected: "${errMissing.message}"`);
    assert(errMissing.data?.code === 'AUTH_TOKEN_MISSING', 'Error code is AUTH_TOKEN_MISSING');

    // 1.2 Malformed Token
    const errMalformed = await new Promise<any>((resolve) => {
      const s = trackSocket(ClientSocket(socketUrl, {
        transports: ['websocket'],
        auth: { token: 'invalid.not-a-jwt-token.xyz' },
        timeout: 2000
      }));
      s.on('connect_error', (err) => resolve(err));
      s.on('connect', () => resolve(new Error('Unexpected connection with malformed token')));
    });
    assert(errMalformed.message.includes('Invalid token'), `Malformed token rejected: "${errMalformed.message}"`);
    assert(errMalformed.data?.code === 'TOKEN_INVALID', 'Error code is TOKEN_INVALID');

    // 1.3 Expired Token
    const errExpired = await new Promise<any>((resolve) => {
      const s = trackSocket(ClientSocket(socketUrl, {
        transports: ['websocket'],
        auth: { token: expiredToken },
        timeout: 2000
      }));
      s.on('connect_error', (err) => resolve(err));
      s.on('connect', () => resolve(new Error('Unexpected connection with expired token')));
    });
    assert(errExpired.message.includes('Token expired'), `Expired token rejected: "${errExpired.message}"`);
    assert(errExpired.data?.code === 'TOKEN_EXPIRED', 'Error code is TOKEN_EXPIRED');

    // 1.4 Token with Wrong Secret / Tampered Signature
    const errWrongSecret = await new Promise<any>((resolve) => {
      const s = trackSocket(ClientSocket(socketUrl, {
        transports: ['websocket'],
        auth: { token: wrongSecretToken },
        timeout: 2000
      }));
      s.on('connect_error', (err) => resolve(err));
      s.on('connect', () => resolve(new Error('Unexpected connection with invalid signature')));
    });
    assert(errWrongSecret.message.includes('Invalid token signature'), `Invalid signature rejected: "${errWrongSecret.message}"`);

    // ------------------------------------------------------------------------
    // TEST GROUP 2: SUCCESSFUL AUTHENTICATION & EXTRACTION OPTIONS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Successful Authenticated Connection ---');

    // 2.1 Standard auth payload: auth: { token }
    const socketAuthPayload = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: devTokenA },
      timeout: 3000
    }));

    await new Promise<void>((resolve, reject) => {
      socketAuthPayload.on('connect', () => resolve());
      socketAuthPayload.on('connect_error', (err) => reject(err));
    });
    assert(socketAuthPayload.connected, 'Client connected via standard auth: { token }');

    // 2.2 HTTP Authorization header: extraHeaders: { Authorization: Bearer <token> }
    const socketHeaderAuth = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      extraHeaders: { Authorization: `Bearer ${devTokenA}` },
      timeout: 3000
    }));

    await new Promise<void>((resolve, reject) => {
      socketHeaderAuth.on('connect', () => resolve());
      socketHeaderAuth.on('connect_error', (err) => reject(err));
    });
    assert(socketHeaderAuth.connected, 'Client connected via extraHeaders: { Authorization: Bearer <token> }');

    // 2.3 Query string fallback: query: { token }
    const socketQueryAuth = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      query: { token: devTokenA },
      timeout: 3000
    }));

    await new Promise<void>((resolve, reject) => {
      socketQueryAuth.on('connect', () => resolve());
      socketQueryAuth.on('connect_error', (err) => reject(err));
    });
    assert(socketQueryAuth.connected, 'Client connected via query: { token }');

    // ------------------------------------------------------------------------
    // TEST GROUP 3: HEADER & QUERY SPOOFING DEFEAT
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Header & Query Spoofing Defeat ---');

    // Attacker connects with Tenant A dev token, but attempts to spoof:
    // query: { tenantId: 'tenant-medsync-002', role: 'super_admin' }
    const spoofedSocket = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: devTokenA },
      query: {
        tenantId: tenantBId,
        role: 'super_admin'
      },
      timeout: 3000
    }));

    await new Promise<void>((resolve) => spoofedSocket.on('connect', resolve));
    assert(spoofedSocket.connected, 'Spoofing attacker socket connected with valid token');

    // Verify spoofing attacker is NOT in tenant B room:
    // Broadcast an event to Tenant B
    let attackerReceivedTenantBEvent = false;
    spoofedSocket.on('SECRET_EVENT_B', () => {
      attackerReceivedTenantBEvent = true;
    });

    broadcastTicketEvent(tenantBId, 'SECRET_EVENT_B', { confidential: 'MedSync Data' });

    // Broadcast an event to Tenant A
    let attackerReceivedTenantAEvent = false;
    spoofedSocket.on('PUBLIC_EVENT_A', () => {
      attackerReceivedTenantAEvent = true;
    });

    broadcastTicketEvent(tenantAId, 'PUBLIC_EVENT_A', { acme: 'Acme Data' });

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert(
      !attackerReceivedTenantBEvent,
      'SECURITY: Spoofed query tenantId (tenant-medsync-002) was ignored; attacker received ZERO Tenant B events'
    );
    assert(
      attackerReceivedTenantAEvent,
      'SECURITY: Verified token claims bound attacker strictly to Tenant A room (received Acme event)'
    );

    // ------------------------------------------------------------------------
    // TEST GROUP 4: UNAUTHORIZED ROOM-JOIN ATTEMPTS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Unauthorized Room-Join Defense ---');

    const joinAck = await new Promise<any>((resolve) => {
      socketAuthPayload.emit('join_room', { room: `tenant:${tenantBId}` }, (res: any) => resolve(res));
      setTimeout(() => resolve({ timeout: true }), 500);
    });

    assert(joinAck.success === false, 'Arbitrary room join rejected with success: false');
    assert(joinAck.error.includes('forbidden'), `Rejection message indicates forbidden: "${joinAck.error}"`);

    // ------------------------------------------------------------------------
    // TEST GROUP 5: CROSS-TENANT EVENT & BROADCAST ISOLATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Cross-Tenant Event & Broadcast Isolation ---');

    const socketTenantA = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: devTokenA }
    }));

    const socketTenantB = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: devTokenB }
    }));

    await Promise.all([
      new Promise<void>((r) => socketTenantA.on('connect', () => r())),
      new Promise<void>((r) => socketTenantB.on('connect', () => r()))
    ]);

    let tenantAReceived = 0;
    let tenantBReceived = 0;

    socketTenantA.on('TICKET_EVENT', () => tenantAReceived++);
    socketTenantB.on('TICKET_EVENT', () => tenantBReceived++);

    // Broadcast to Tenant A
    broadcastTicketEvent(tenantAId, 'TICKET_EVENT', { ticketId: 'ticket-fb-1042' });
    await new Promise((r) => setTimeout(r, 150));

    assert(tenantAReceived === 1, 'Tenant A client received Tenant A ticket event (1)');
    assert(tenantBReceived === 0, 'SECURITY: Tenant B client received ZERO Tenant A events');

    // Broadcast to Tenant B
    broadcastTicketEvent(tenantBId, 'TICKET_EVENT', { ticketId: 'ticket-medsync-2001' });
    await new Promise((r) => setTimeout(r, 150));

    assert(tenantAReceived === 1, 'SECURITY: Tenant A client received ZERO Tenant B events');
    assert(tenantBReceived === 1, 'Tenant B client received Tenant B ticket event (1)');

    // ------------------------------------------------------------------------
    // TEST GROUP 6: ROLE RESTRICTIONS FOR SENSITIVE DEV EVENTS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Role Restrictions & Telemetry Quarantine ---');

    const socketDev = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: devTokenA }
    }));

    const socketClient = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: clientTokenA }
    }));

    await Promise.all([
      new Promise<void>((r) => socketDev.on('connect', () => r())),
      new Promise<void>((r) => socketClient.on('connect', () => r()))
    ]);

    let devPublicEvents = 0;
    let clientPublicEvents = 0;
    let devInternalEvents = 0;
    let clientInternalEvents = 0;

    socketDev.on('PUBLIC_STATUS_CHANGE', () => devPublicEvents++);
    socketClient.on('PUBLIC_STATUS_CHANGE', () => clientPublicEvents++);

    socketDev.on('INTERNAL_DEV_NOTE', () => devInternalEvents++);
    socketClient.on('INTERNAL_DEV_NOTE', () => clientInternalEvents++);

    // 6.1 Public event (isInternalOnly = false)
    broadcastTicketEvent(tenantAId, 'PUBLIC_STATUS_CHANGE', { status: 'RESOLVED' }, false);
    await new Promise((r) => setTimeout(r, 150));

    assert(devPublicEvents === 1, 'Developer received public status change');
    assert(clientPublicEvents === 1, 'Client User received public status change');

    // 6.2 Internal sensitive event (isInternalOnly = true)
    broadcastTicketEvent(
      tenantAId,
      'INTERNAL_DEV_NOTE',
      { note: 'Sensitive developer trace logs and db errors' },
      true
    );
    await new Promise((r) => setTimeout(r, 150));

    assert(devInternalEvents === 1, 'Developer received internal dev note');
    assert(
      clientInternalEvents === 0,
      'SECURITY: Client User was quarantined and received ZERO internal dev notes'
    );

    // ------------------------------------------------------------------------
    // TEST GROUP 7: DISCONNECT & RECONNECTION LIFECYCLE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Disconnect & Reconnection Lifecycle ---');

    const lifecycleSocket = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: devTokenA }
    }));

    await new Promise<void>((r) => lifecycleSocket.on('connect', () => r()));
    assert(lifecycleSocket.connected, 'Socket connected successfully');

    // Disconnect
    lifecycleSocket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    assert(!lifecycleSocket.connected, 'Socket disconnected cleanly');

    // Reconnect with valid token
    lifecycleSocket.connect();
    await new Promise<void>((r) => lifecycleSocket.on('connect', () => r()));
    assert(lifecycleSocket.connected, 'Socket reconnected successfully with valid token');

    // Reconnect attempt with expired token fails
    const reconnectExpired = trackSocket(ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: expiredToken }
    }));

    const reconnectError = await new Promise<any>((resolve) => {
      reconnectExpired.on('connect_error', resolve);
      reconnectExpired.on('connect', () => resolve(new Error('Unexpected connect')));
    });
    assert(
      reconnectError.message.includes('Token expired'),
      'Reconnection with expired token rejected'
    );

  } finally {
    // Clean up all client sockets
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    // Close servers
    await closeSocketServer();
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  }

  console.log('\n=======================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStep8Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
