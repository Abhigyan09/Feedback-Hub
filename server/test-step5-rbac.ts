import http from 'http';
import express, { Request, Response } from 'express';
import { app } from './src/server.js';
import { requireRole, requireAdmin, requireSuperAdmin, ALL_ROLES } from './src/middleware/rbac.js';
import { authenticate } from './src/middleware/authenticate.js';
import { signAccessToken, hashPassword } from './src/services/auth.service.js';
import { tenantStore } from './src/config/db.js';
import { UserRole } from './src/types/index.js';

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

async function runStep5Tests() {
  console.log('\n=======================================================');
  console.log('FEEDBACK-HUB: STEP 5 RBAC & PROTECTED ROUTES TEST SUITE');
  console.log('=======================================================\n');

  // Setup: seed test credentials
  const samplePassword = 'TestPassword123!';
  await tenantStore.ensureDevSeedCredentials(hashPassword, samplePassword);

  // Define test users across all roles and both tenants
  const tenantAId = 'tenant-acme-corp-001';
  const tenantBId = 'tenant-medsync-002';

  const users: Record<string, { token: string; role: UserRole; tenantId: string; sub: string }> = {
    superAdmin: {
      sub: 'user-super-01',
      tenantId: tenantAId,
      role: 'super_admin',
      token: signAccessToken({
        sub: 'user-super-01',
        tenant_id: tenantAId,
        role: 'super_admin',
        email: 'superadmin@feedbackhub.io',
        full_name: 'Alex Vance'
      })
    },
    tenantAdmin: {
      sub: 'user-admin-01',
      tenantId: tenantAId,
      role: 'tenant_admin',
      token: signAccessToken({
        sub: 'user-admin-01',
        tenant_id: tenantAId,
        role: 'tenant_admin',
        email: 'admin.priya@acme.com',
        full_name: 'Priya Sharma'
      })
    },
    squadLead: {
      sub: 'user-lead-01',
      tenantId: tenantAId,
      role: 'squad_lead',
      token: signAccessToken({
        sub: 'user-lead-01',
        tenant_id: tenantAId,
        role: 'squad_lead',
        email: 'lead.dev@acme.com',
        full_name: 'Vikram Mehta'
      })
    },
    developer: {
      sub: 'user-dev-01',
      tenantId: tenantAId,
      role: 'developer',
      token: signAccessToken({
        sub: 'user-dev-01',
        tenant_id: tenantAId,
        role: 'developer',
        email: 'dev.rahul@acme.com',
        full_name: 'Rahul Sharma'
      })
    },
    supportAgent: {
      sub: 'user-support-01',
      tenantId: tenantAId,
      role: 'support_agent',
      token: signAccessToken({
        sub: 'user-support-01',
        tenant_id: tenantAId,
        role: 'support_agent',
        email: 'support.amit@acme.com',
        full_name: 'Amit Patel'
      })
    },
    clientUser: {
      sub: 'user-client-01',
      tenantId: tenantAId,
      role: 'client_user',
      token: signAccessToken({
        sub: 'user-client-01',
        tenant_id: tenantAId,
        role: 'client_user',
        email: 'operations@partner-client.com',
        full_name: 'Sarah Jenkins'
      })
    },
    medsyncDev: {
      sub: 'user-medsync-dev-01',
      tenantId: tenantBId,
      role: 'developer',
      token: signAccessToken({
        sub: 'user-medsync-dev-01',
        tenant_id: tenantBId,
        role: 'developer',
        email: 'dev.elena@medsync.io',
        full_name: 'Elena Rostova'
      })
    }
  };

  // Dedicated test harness for isolated requireRole middleware tests
  const testApp = express();
  testApp.use(express.json());

  // Test endpoint 1: unauthenticated requireRole directly
  testApp.get('/test/require-role-direct', requireRole(['developer']), (req, res) => {
    res.json({ ok: true });
  });

  // Test endpoint 2: authenticated requireRole
  testApp.get('/test/admin-only', authenticate, requireRole(['super_admin', 'tenant_admin']), (req, res) => {
    res.json({ ok: true, role: req.auth?.role });
  });

  testApp.get('/test/super-only', authenticate, requireSuperAdmin(), (req, res) => {
    res.json({ ok: true, role: req.auth?.role });
  });

  const testServer = http.createServer(testApp);
  await new Promise<void>((resolve) => testServer.listen(0, resolve));
  const testPort = (testServer.address() as any).port;
  const testBaseUrl = `http://localhost:${testPort}`;

  // Start main app server
  const mainServer = http.createServer(app);
  await new Promise<void>((resolve) => mainServer.listen(0, resolve));
  const mainPort = (mainServer.address() as any).port;
  const mainBaseUrl = `http://localhost:${mainPort}`;

  try {
    // ------------------------------------------------------------------------
    // TEST GROUP 1: UNAUTHENTICATED ACCESS TO PROTECTED ROUTES
    // ------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Unauthenticated Access to Protected Routes ---');

    // 1.1 Direct requireRole without req.auth returns 401
    const resDirectNoAuth = await fetch(`${testBaseUrl}/test/require-role-direct`);
    assert(resDirectNoAuth.status === 401, 'Direct requireRole without auth returns 401 (Got 401)');
    const bodyDirectNoAuth = await resDirectNoAuth.json();
    assert(bodyDirectNoAuth.code === 'AUTH_REQUIRED', 'Error code is AUTH_REQUIRED');

    // 1.2 GET /api/v1/tickets without token -> 401
    const resTicketsNoAuth = await fetch(`${mainBaseUrl}/api/v1/tickets`);
    assert(resTicketsNoAuth.status === 401, 'GET /api/v1/tickets without token returns 401');

    // 1.3 GET /api/v1/tickets/:id without token -> 401
    const resTicketIdNoAuth = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042`);
    assert(resTicketIdNoAuth.status === 401, 'GET /api/v1/tickets/:id without token returns 401');

    // 1.4 PATCH /api/v1/tickets/:id/status without token -> 401
    const resPatchNoAuth = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' })
    });
    assert(resPatchNoAuth.status === 401, 'PATCH /api/v1/tickets/:id/status without token returns 401');

    // 1.5 POST /api/v1/tickets/:id/events without token -> 401
    const resPostEventNoAuth = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test unauthenticated event' })
    });
    assert(resPostEventNoAuth.status === 401, 'POST /api/v1/tickets/:id/events without token returns 401');

    // 1.6 GET /api/v1/tenants/current without token -> 401
    const resTenantCurrentNoAuth = await fetch(`${mainBaseUrl}/api/v1/tenants/current`);
    assert(resTenantCurrentNoAuth.status === 401, 'GET /api/v1/tenants/current without token returns 401');

    // 1.7 PATCH /api/v1/tenants/current without token -> 401
    const resTenantPatchNoAuth = await fetch(`${mainBaseUrl}/api/v1/tenants/current`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacked Name' })
    });
    assert(resTenantPatchNoAuth.status === 401, 'PATCH /api/v1/tenants/current without token returns 401');

    // 1.8 GET /api/v1/tenants/all without token -> 401
    const resTenantsAllNoAuth = await fetch(`${mainBaseUrl}/api/v1/tenants/all`);
    assert(resTenantsAllNoAuth.status === 401, 'GET /api/v1/tenants/all without token returns 401');

    // ------------------------------------------------------------------------
    // TEST GROUP 2: ROLE AUTHORIZATION MATRIX (PATCH /tickets/:id/status)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Role Authorization Matrix & Status Updates ---');

    // 2.1 developer: permitted -> 200 OK
    const resDevStatus = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.developer.token}`
      },
      body: JSON.stringify({ status: 'IN_DEV', note: 'Developer active on fix' })
    });
    assert(resDevStatus.status === 200, 'Developer is authorized to update ticket status (200 OK)');
    const bodyDevStatus = await resDevStatus.json();
    assert(bodyDevStatus.ticket.status === 'IN_DEV', 'Ticket status updated to IN_DEV');

    // 2.2 squad_lead: permitted -> 200 OK
    const resLeadStatus = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.squadLead.token}`
      },
      body: JSON.stringify({ status: 'IN_QA', note: 'Lead pushed to QA review' })
    });
    assert(resLeadStatus.status === 200, 'Squad Lead is authorized to update ticket status (200 OK)');

    // 2.3 tenant_admin: permitted -> 200 OK
    const resAdminStatus = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.tenantAdmin.token}`
      },
      body: JSON.stringify({ status: 'RESOLVED', note: 'Admin verified resolution' })
    });
    assert(resAdminStatus.status === 200, 'Tenant Admin is authorized to update ticket status (200 OK)');

    // 2.4 super_admin: permitted -> 200 OK
    const resSuperStatus = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.superAdmin.token}`
      },
      body: JSON.stringify({ status: 'CLOSED', note: 'Super Admin closed ticket' })
    });
    assert(resSuperStatus.status === 200, 'Super Admin is authorized to update ticket status (200 OK)');

    // 2.5 support_agent: forbidden -> 403 Forbidden
    const resSupportStatus = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.supportAgent.token}`
      },
      body: JSON.stringify({ status: 'CLOSED' })
    });
    assert(resSupportStatus.status === 403, 'Support Agent is forbidden from updating ticket status (403)');
    const bodySupportStatus = await resSupportStatus.json();
    assert(bodySupportStatus.code === 'FORBIDDEN', 'Error code is FORBIDDEN for support agent status update');

    // 2.6 client_user: forbidden -> 403 Forbidden
    const resClientStatus = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.clientUser.token}`
      },
      body: JSON.stringify({ status: 'OPEN' })
    });
    assert(resClientStatus.status === 403, 'Client User is forbidden from updating ticket status (403)');

    // ------------------------------------------------------------------------
    // TEST GROUP 3: DEVELOPER ATTEMPTING ADMIN-ONLY ACTIONS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Developer Attempting Admin-Only Actions ---');

    // 3.1 Developer attempts GET /api/v1/tenants/all (Super Admin only) -> 403 Forbidden
    const resDevAllTenants = await fetch(`${mainBaseUrl}/api/v1/tenants/all`, {
      headers: { Authorization: `Bearer ${users.developer.token}` }
    });
    assert(resDevAllTenants.status === 403, 'Developer attempting GET /tenants/all is blocked with 403 (Got 403)');
    const bodyDevAllTenants = await resDevAllTenants.json();
    assert(bodyDevAllTenants.code === 'FORBIDDEN', 'Error code is FORBIDDEN');
    assert(bodyDevAllTenants.current_role === 'developer', 'Reports current role as developer');

    // 3.2 Developer attempts PATCH /api/v1/tenants/current (Admin only) -> 403 Forbidden
    const resDevPatchTenant = await fetch(`${mainBaseUrl}/api/v1/tenants/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.developer.token}`
      },
      body: JSON.stringify({ plan: 'UNLIMITED_ENTERPRISE' })
    });
    assert(resDevPatchTenant.status === 403, 'Developer attempting PATCH /tenants/current is blocked with 403 (Got 403)');

    // 3.3 Contrast: Tenant Admin attempts PATCH /api/v1/tenants/current -> 200 OK
    const resAdminPatchTenant = await fetch(`${mainBaseUrl}/api/v1/tenants/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users.tenantAdmin.token}`
      },
      body: JSON.stringify({ name: 'Acme Payments Global Inc.' })
    });
    assert(resAdminPatchTenant.status === 200, 'Tenant Admin successfully updates tenant configuration (200 OK)');
    const bodyAdminPatch = await resAdminPatchTenant.json();
    assert(bodyAdminPatch.tenant.name === 'Acme Payments Global Inc.', 'Tenant name was updated');

    // 3.4 Contrast: Tenant Admin attempting GET /api/v1/tenants/all -> 403 Forbidden (restricted to Super Admin)
    const resAdminAllTenants = await fetch(`${mainBaseUrl}/api/v1/tenants/all`, {
      headers: { Authorization: `Bearer ${users.tenantAdmin.token}` }
    });
    assert(resAdminAllTenants.status === 403, 'Tenant Admin cannot enumerate all tenants (403 Forbidden)');

    // 3.5 Contrast: Super Admin calls GET /api/v1/tenants/all -> 200 OK
    const resSuperAllTenants = await fetch(`${mainBaseUrl}/api/v1/tenants/all`, {
      headers: { Authorization: `Bearer ${users.superAdmin.token}` }
    });
    assert(resSuperAllTenants.status === 200, 'Super Admin successfully enumerates all tenants (200 OK)');
    const bodySuperAll = await resSuperAllTenants.json();
    assert(Array.isArray(bodySuperAll.tenants) && bodySuperAll.tenants.length >= 2, 'Returns full list of platform tenants');

    // ------------------------------------------------------------------------
    // TEST GROUP 4: HEADER SPOOFING & PRIVILEGE ESCALATION RESISTANCE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Header Spoofing & Privilege Escalation Resistance ---');

    // 4.1 Developer sends X-User-Role: super_admin to GET /tenants/all -> 403 Forbidden
    const resSpoofDevToSuper = await fetch(`${mainBaseUrl}/api/v1/tenants/all`, {
      headers: {
        Authorization: `Bearer ${users.developer.token}`,
        'X-User-Role': 'super_admin'
      }
    });
    assert(resSpoofDevToSuper.status === 403, 'SECURITY: X-User-Role: super_admin ignored; developer denied 403');
    const bodySpoofDev = await resSpoofDevToSuper.json();
    assert(bodySpoofDev.current_role === 'developer', 'Verified token role (developer) preserved');

    // 4.2 Developer sends X-User-Role: tenant_admin to PATCH /tenants/current -> 403 Forbidden
    const resSpoofDevToAdmin = await fetch(`${mainBaseUrl}/api/v1/tenants/current`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${users.developer.token}`,
        'X-User-Role': 'tenant_admin',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plan: 'HACKED_FREE_PLAN' })
    });
    assert(resSpoofDevToAdmin.status === 403, 'SECURITY: X-User-Role: tenant_admin ignored; developer denied 403');

    // 4.3 Client user sends X-User-Role: developer to PATCH /tickets/:id/status -> 403 Forbidden
    const resSpoofClientToDev = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${users.clientUser.token}`,
        'X-User-Role': 'developer',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'CLOSED' })
    });
    assert(resSpoofClientToDev.status === 403, 'SECURITY: X-User-Role: developer ignored; client_user denied 403');

    // 4.4 Unauthenticated attacker sends X-User-Role: super_admin -> 401 Unauthorized
    const resUnauthSpoof = await fetch(`${mainBaseUrl}/api/v1/tenants/all`, {
      headers: { 'X-User-Role': 'super_admin' }
    });
    assert(resUnauthSpoof.status === 401, 'SECURITY: Unauthenticated spoofed X-User-Role rejected with 401');

    // ------------------------------------------------------------------------
    // TEST GROUP 5: CROSS-TENANT RESOURCE ACCESS & ISOLATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Cross-Tenant Resource Isolation ---');

    // 5.1 Tenant A user requests Tenant B ticket -> 404 Not Found
    const resCrossTicket = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-medsync-2001`, {
      headers: { Authorization: `Bearer ${users.developer.token}` }
    });
    assert(resCrossTicket.status === 404, 'SECURITY: Tenant A dev requesting Tenant B ticket returns 404 (Got 404)');

    // 5.2 Tenant A user sends X-Tenant-Id: tenant-medsync-002 -> 404 Not Found (Header spoofing defeated)
    const resCrossTicketSpoof = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-medsync-2001`, {
      headers: {
        Authorization: `Bearer ${users.developer.token}`,
        'X-Tenant-Id': tenantBId
      }
    });
    assert(resCrossTicketSpoof.status === 404, 'SECURITY: X-Tenant-Id header ignored; cross-tenant ticket returns 404');

    // 5.3 Tenant A user requests GET /tickets?tenant_id=tenant-medsync-002 -> Only Tenant A tickets returned
    const resQuerySpoof = await fetch(`${mainBaseUrl}/api/v1/tickets?tenant_id=${tenantBId}`, {
      headers: { Authorization: `Bearer ${users.developer.token}` }
    });
    assert(resQuerySpoof.status === 200, 'GET /tickets returned 200 OK');
    const bodyQuerySpoof = await resQuerySpoof.json();
    assert(bodyQuerySpoof.tenant_id === tenantAId, `Response tenant_id is strictly Tenant A: ${bodyQuerySpoof.tenant_id}`);
    const hasMedSyncTicket = bodyQuerySpoof.tickets.some((t: any) => t.id === 'ticket-medsync-2001' || t.tenant_id === tenantBId);
    assert(!hasMedSyncTicket, 'SECURITY: Zero Tenant B tickets leaked in query-string spoof attempt');

    // 5.4 Tenant A dev attempts PATCH on Tenant B ticket with body tenant_id spoofing -> 404 Not Found
    const resCrossPatch = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-medsync-2001/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${users.developer.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'CLOSED', tenant_id: tenantBId })
    });
    assert(resCrossPatch.status === 404, 'SECURITY: Cross-tenant PATCH status returns 404 Not Found');

    // 5.5 Tenant A user calls GET /tenants/current with X-Tenant-Id: tenant-medsync-002 -> Returns Tenant A
    const resTenantCurrentSpoof = await fetch(`${mainBaseUrl}/api/v1/tenants/current`, {
      headers: {
        Authorization: `Bearer ${users.developer.token}`,
        'X-Tenant-Id': tenantBId
      }
    });
    assert(resTenantCurrentSpoof.status === 200, 'GET /tenants/current returns 200');
    const bodyTenantCurrent = await resTenantCurrentSpoof.json();
    assert(bodyTenantCurrent.tenant.id === tenantAId, `Returns Tenant A metadata (Got ${bodyTenantCurrent.tenant.id})`);
    assert(bodyTenantCurrent.tenant.slug === 'acme-payments', 'Returns Acme Payments metadata');

    // 5.6 Tenant B developer can legitimately access Tenant B ticket -> 200 OK
    const resMedSyncValid = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-medsync-2001`, {
      headers: { Authorization: `Bearer ${users.medsyncDev.token}` }
    });
    assert(resMedSyncValid.status === 200, 'Tenant B dev can view their own tenant ticket (200 OK)');
    const bodyMedSyncValid = await resMedSyncValid.json();
    assert(bodyMedSyncValid.ticket.id === 'ticket-medsync-2001', 'Ticket details retrieved for tenant B');

    // 5.7 Tenant B developer cannot access Tenant A ticket -> 404 Not Found
    const resMedSyncToAcme = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042`, {
      headers: { Authorization: `Bearer ${users.medsyncDev.token}` }
    });
    assert(resMedSyncToAcme.status === 404, 'SECURITY: Tenant B dev cannot view Tenant A ticket (404 Not Found)');

    // ------------------------------------------------------------------------
    // TEST GROUP 6: TELEMETRY & INTERNAL NOTES QUARANTINE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Telemetry & Internal Notes Role Quarantine ---');

    // 6.1 Developer can view decrypted sensitive telemetry on ticket
    const resDevTicketView = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042`, {
      headers: { Authorization: `Bearer ${users.developer.token}` }
    });
    assert(resDevTicketView.status === 200, 'Developer fetched ticket-fb-1042 (200 OK)');
    const bodyDevView = await resDevTicketView.json();
    assert(
      typeof bodyDevView.ticket.telemetry.encrypted_sensitive_data === 'string' &&
      bodyDevView.ticket.telemetry.encrypted_sensitive_data.includes('REDACTED_CLIENT_SECRET'),
      'Developer can view decrypted sensitive telemetry'
    );

    // 6.2 Developer can view internal developer notes (is_internal_only = true)
    const hasDevInternalNote = bodyDevView.events.some((e: any) => e.is_internal_only === true);
    assert(hasDevInternalNote, 'Developer can view internal notes (is_internal_only = true)');

    // 6.3 Client user viewing ticket has internal notes quarantined (hidden)
    const resClientTicketView = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042`, {
      headers: { Authorization: `Bearer ${users.clientUser.token}` }
    });
    assert(resClientTicketView.status === 200, 'Client User fetched ticket-fb-1042 (200 OK)');
    const bodyClientView = await resClientTicketView.json();
    const clientSeesInternalNote = bodyClientView.events.some((e: any) => e.is_internal_only === true);
    assert(!clientSeesInternalNote, 'SECURITY: Client User cannot view internal notes (is_internal_only filtered)');
    assert(bodyClientView.events.length > 0, 'Client User can still view public client replies');

    // 6.4 Client user submitting event with is_internal_only: true is forced to false
    const resClientPostEvent = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${users.clientUser.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Client comment attempting internal flag',
        is_internal_only: true
      })
    });
    assert(resClientPostEvent.status === 201, 'Client user event posted (201 Created)');
    const bodyClientPostEvent = await resClientPostEvent.json();
    assert(bodyClientPostEvent.event.is_internal_only === false, 'SECURITY: is_internal_only was forced to false for client_user');
    assert(bodyClientPostEvent.event.event_type === 'CLIENT_REPLY', 'Event type set to CLIENT_REPLY');

    // 6.5 Developer submitting event with is_internal_only: true is honored
    const resDevPostEvent = await fetch(`${mainBaseUrl}/api/v1/tickets/ticket-fb-1042/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${users.developer.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Internal developer trace log note',
        is_internal_only: true
      })
    });
    assert(resDevPostEvent.status === 201, 'Developer event posted (201 Created)');
    const bodyDevPostEvent = await resDevPostEvent.json();
    assert(bodyDevPostEvent.event.is_internal_only === true, 'Developer is_internal_only: true is preserved');
    assert(bodyDevPostEvent.event.event_type === 'DEV_NOTE', 'Event type set to DEV_NOTE');

    // ------------------------------------------------------------------------
    // TEST GROUP 7: PUBLIC ROUTES & REGRESSION INTEGRITY
    // ------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Public Endpoints & Regression Integrity ---');

    // 7.1 POST /api/v1/auth/login remains public without access token -> 200 OK
    const resLogin = await fetch(`${mainBaseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev.rahul@acme.com',
        password: samplePassword,
        tenant_slug: 'acme-payments'
      })
    });
    assert(resLogin.status === 200, 'POST /api/v1/auth/login remains public and returns 200 OK');
    const bodyLogin = await resLogin.json();
    assert(Boolean(bodyLogin.access_token), 'Login returns access_token');

    // 7.2 GET /health remains public -> 200 OK
    const resHealth = await fetch(`${mainBaseUrl}/health`);
    assert(resHealth.status === 200, 'GET /health remains public and returns 200 OK');

    // 7.3 POST /api/v1/ingest/ticket remains public with X-Product-Key -> 201 Created
    const resIngest = await fetch(`${mainBaseUrl}/api/v1/ingest/ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Product-Key': 'fb_live_acme_checkout_key_998'
      },
      body: JSON.stringify({
        title: 'RBAC verification test incident',
        description: 'Testing public ingest telemetry',
        category: 'BUG',
        severity: 'LOW'
      })
    });
    assert(resIngest.status === 201, 'POST /api/v1/ingest/ticket remains public with X-Product-Key (201 Created)');

    // 7.4 Sensitive fields (password_hash) stripped in GET /tenants/current team members
    const resTeamCheck = await fetch(`${mainBaseUrl}/api/v1/tenants/current`, {
      headers: { Authorization: `Bearer ${users.developer.token}` }
    });
    const bodyTeamCheck = await resTeamCheck.json();
    const hasPasswordLeak = bodyTeamCheck.team_members.some((u: any) => 'password_hash' in u);
    assert(!hasPasswordLeak, 'SECURITY: password_hash stripped from all team_members in /tenants/current');

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

runStep5Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
