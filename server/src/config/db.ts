import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { ENV } from './env.js';
import { Tenant, User, Product, Ticket, TicketEvent, UserRole, PermissionKey, RolePermissionsMatrix, RefreshTokenRecord, PasswordResetTokenRecord } from '../types/index.js';
import { encryptSensitiveData } from '../services/crypto.js';
import { createDefaultPermissionsMatrix, DEFAULT_ROLE_PERMISSIONS, ALL_ROLES, PERMISSION_DEFINITIONS } from './permissions.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Flag indicating if live Postgres connection is established
export let isPostgresConnected = false;

function getDbFilePath(): string {
  // Check if cwd has 'db' directory
  const rootDb = path.resolve(process.cwd(), 'db', 'feedback_hub_db.json');
  if (fs.existsSync(path.resolve(process.cwd(), 'db'))) {
    return rootDb;
  }
  const parentDb = path.resolve(process.cwd(), '..', 'db', 'feedback_hub_db.json');
  if (fs.existsSync(path.resolve(process.cwd(), '..', 'db'))) {
    return parentDb;
  }
  return rootDb;
}

// Persistent Multi-Tenant Database Store with Automatic Disk Sync
export class MultiTenantStore {
  public tenants: Tenant[] = [];
  public users: User[] = [];
  public products: Product[] = [];
  public tickets: Ticket[] = [];
  public events: TicketEvent[] = [];
  public refreshTokens: RefreshTokenRecord[] = [];
  public passwordResetTokens: PasswordResetTokenRecord[] = [];
  public permissionsMatrix: Record<string, RolePermissionsMatrix> = {};

  constructor() {
    const loaded = this.loadFromDisk();
    if (!loaded) {
      this.seedInitialData();
      this.seedRichLiveTickets();
      this.saveToDisk();
    } else {
      let changed = false;
      if (!this.tickets.some(t => t.id === 'ticket-fb-1042') || !this.tickets.some(t => t.id === 'ticket-1041')) {
        this.seedRichLiveTickets();
        changed = true;
      }
      if (!this.users.some(u => u.email === 'admin.priya@acme.com') || !this.users.some(u => u.id === 'member-1')) {
        this.seedInitialData();
        changed = true;
      }
      if (changed) {
        this.saveToDisk();
      }
    }
  }

  /**
   * Save the current state atomically to disk.
   */
  public saveToDisk(): void {
    try {
      const data = {
        tenants: this.tenants,
        users: this.users,
        products: this.products,
        tickets: this.tickets,
        events: this.events,
        permissionsMatrix: this.permissionsMatrix,
        last_updated: new Date().toISOString()
      };
      const targetPath = getDbFilePath();
      const dbDir = path.dirname(targetPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      const tempPath = `${targetPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, targetPath);
    } catch (err) {
      console.error('[Database File Save Error]', err);
    }
  }

  /**
   * Load stored state from disk.
   */
  public loadFromDisk(): boolean {
    try {
      const targetPath = getDbFilePath();
      if (fs.existsSync(targetPath)) {
        const raw = fs.readFileSync(targetPath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tenants) && data.tenants.length > 0) {
          this.tenants = data.tenants;
          this.users = Array.isArray(data.users) ? data.users : [];
          this.products = Array.isArray(data.products) ? data.products : [];
          this.tickets = Array.isArray(data.tickets) ? data.tickets : [];
          this.events = Array.isArray(data.events) ? data.events : [];
          this.permissionsMatrix = data.permissionsMatrix || {};
          console.log(`[Database] Loaded persistent data: ${this.tickets.length} tickets, ${this.products.length} products, ${this.tenants.length} tenants.`);
          return true;
        }
      }
    } catch (err) {
      console.error('[Database File Load Error]', err);
    }
    return false;
  }

  private seedInitialData() {
    // 1. Tenant A: Fintech Enterprise Client
    const tenantA: Tenant = {
      id: 'tenant-acme-corp-001',
      name: 'Acme Payments Inc.',
      slug: 'acme-payments',
      plan: 'ENTERPRISE',
      isolation_standard: 'PostgreSQL 16 RLS (Bank-Grade)',
      allowed_domains: ['payments.acme.com', 'checkout.acme.com', 'merchant.acme.com', 'localhost:3000'],
      webhook_url: 'https://api.acme.com/v1/webhooks/incident-bridge',
      notification_email: 'security-alerts@acme.com',
      auto_capture_telemetry: true,
      auto_capture_network: true,
      require_email: false,
      default_squad: 'Core Platform & API Squad',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString()
    };

    // 2. Tenant B: HealthTech Client
    const tenantB: Tenant = {
      id: 'tenant-medsync-002',
      name: 'MedSync Healthcare',
      slug: 'medsync',
      plan: 'ENTERPRISE',
      isolation_standard: 'PostgreSQL 16 RLS (Bank-Grade)',
      allowed_domains: ['medsync.io', 'portal.medsync.io', 'localhost:3000'],
      webhook_url: 'https://telehealth.medsync.io/ops/webhook',
      notification_email: 'hipaa-alerts@medsync.io',
      auto_capture_telemetry: true,
      auto_capture_network: false,
      require_email: true,
      default_squad: 'Clinical Telehealth Squad',
      created_at: new Date(Date.now() - 15 * 86400000).toISOString()
    };

    if (this.tenants.length === 0) {
      this.tenants = [tenantA, tenantB];
    } else {
      for (const t of [tenantA, tenantB]) {
        if (!this.tenants.some(existing => existing.id === t.id)) {
          this.tenants.push(t);
        }
      }
    }

    // Products
    const prod1: Product = {
      id: 'prod-checkout-gateway',
      tenant_id: tenantA.id,
      name: 'Checkout Gateway API & SDK',
      slug: 'checkout-api',
      description: 'Primary payment checkout portal and embedded SDK widget',
      api_key_hash: 'hash_prod_live_checkout_key',
      raw_api_key: 'fb_live_acme_checkout_key_998',
      environment: 'production',
      created_at: new Date().toISOString()
    };

    const prod2: Product = {
      id: 'prod-dashboard',
      tenant_id: tenantA.id,
      name: 'Merchant Admin Portal',
      slug: 'merchant-portal',
      description: 'Merchant dashboard for settlements and reconciliation',
      api_key_hash: 'hash_prod_live_portal_key',
      raw_api_key: 'hash_prod_live_portal_key',
      environment: 'staging',
      created_at: new Date().toISOString()
    };

    const prodMed: Product = {
      id: 'prod-telehealth-portal',
      tenant_id: tenantB.id,
      name: 'MedSync Telehealth Patient Web',
      slug: 'telehealth-web',
      description: 'HIPAA-compliant encrypted video and patient vitals portal',
      api_key_hash: 'hash_prod_live_medsync_key',
      raw_api_key: 'fb_live_medsync_key_771',
      environment: 'production',
      created_at: new Date().toISOString()
    };

    if (this.products.length === 0) {
      this.products = [prod1, prod2, prodMed];
    } else {
      for (const p of [prod1, prod2, prodMed]) {
        if (!this.products.some(existing => existing.id === p.id)) {
          this.products.push(p);
        }
      }
    }

    // Users
    const seedUsers: User[] = [
      {
        id: 'user-super-01',
        tenant_id: tenantA.id,
        email: 'superadmin@feedbackhub.io',
        full_name: 'Alex Vance (Global Super Admin)',
        role: 'super_admin',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-admin-01',
        tenant_id: tenantA.id,
        email: 'admin.priya@acme.com',
        full_name: 'Priya Sharma (Acme Admin)',
        role: 'tenant_admin',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-lead-01',
        tenant_id: tenantA.id,
        email: 'lead.dev@acme.com',
        full_name: 'Vikram Mehta (API Squad Lead)',
        role: 'squad_lead',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-dev-01',
        tenant_id: tenantA.id,
        email: 'dev.rahul@acme.com',
        full_name: 'Rahul Sharma (Senior Backend Dev)',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-support-01',
        tenant_id: tenantA.id,
        email: 'support.amit@acme.com',
        full_name: 'Amit Patel (Support Agent)',
        role: 'support_agent',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-client-01',
        tenant_id: tenantA.id,
        email: 'client.john@partner.com',
        full_name: 'John Client (Partner Merchant)',
        role: 'client_user',
        is_active: true,
        created_at: new Date().toISOString()
      },
      // Team members for dashboard & assignment
      {
        id: 'member-1',
        tenant_id: tenantA.id,
        email: 'elena.rostova@feedbackhub.io',
        full_name: 'Elena Rostova',
        role: 'squad_lead',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'member-2',
        tenant_id: tenantA.id,
        email: 'marcus.chen@feedbackhub.io',
        full_name: 'Marcus Chen',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-dev-02',
        tenant_id: tenantA.id,
        email: 'priya.nair@acme.com',
        full_name: 'Priya Nair (Frontend Platform Dev)',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'user-dev-03',
        tenant_id: tenantA.id,
        email: 'amit.patel@acme.com',
        full_name: 'Amit Patel (Full-Stack Reliability Dev)',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 'member-3',
        tenant_id: tenantA.id,
        email: 'sarah.jenkins@feedbackhub.io',
        full_name: 'Sarah Jenkins',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      },
      // Tenant B (MedSync) user to verify multi-tenant isolation
      {
        id: 'user-medsync-dev-01',
        tenant_id: tenantB.id,
        email: 'dev.elena@medsync.io',
        full_name: 'Elena Rostova (MedSync Dev)',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      }
    ];

    if (this.users.length === 0) {
      this.users = seedUsers;
    } else {
      for (const u of seedUsers) {
        if (!this.users.some(existing => existing.id === u.id || existing.email === u.email)) {
          this.users.push(u);
        }
      }
    }

    // Seed default bank-grade role permissions matrix
    this.permissionsMatrix[tenantA.id] = createDefaultPermissionsMatrix();
    this.permissionsMatrix[tenantB.id] = createDefaultPermissionsMatrix();
  }

  public seedRichLiveTickets() {
    const tenantAId = 'tenant-acme-corp-001';
    const tenantBId = 'tenant-medsync-002';
    const now = Date.now();

    const sampleTickets: Ticket[] = [
      {
        id: 'ticket-fb-1042',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1042',
        title: 'HTTP 504 Gateway Timeout during UPI Webhook settlement',
        description: 'Production checkout failed for 14 enterprise transactions during peak settlement hour. Merchant receives blank loading state.',
        category: 'API_FAILURE',
        severity: 'CRITICAL',
        status: 'IN_DEV',
        reporter_email: 'operations@partner-client.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-dev-01',
        assigned_to_name: 'Rahul Sharma (Senior Backend Dev)',
        sla_due_at: new Date(now + 45 * 60000).toISOString(),
        created_at: new Date(now - 35 * 60000).toISOString(),
        updated_at: new Date(now - 10 * 60000).toISOString(),
        telemetry: {
          page_url: 'https://checkout.acme.com/v2/pay/upi/intent?session=sess_982b',
          app_version: 'v2.14.0-prod',
          user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
          viewport_dimensions: '390x844',
          console_logs: [
            { type: 'info', message: 'Initialized UPI SDK v2.4.1', timestamp: '18:12:02' },
            { type: 'error', message: 'Uncaught (in promise) Error: GatewayTimeout at fetchWithRetry (/bundle.js:842)', timestamp: '18:12:45' }
          ],
          network_errors: [
            { url: 'https://api.acme.com/v1/settlements/verify', status: 504, method: 'POST', timestamp: '18:12:45' }
          ],
          encrypted_sensitive_data: encryptSensitiveData(JSON.stringify({
            authHeader: 'Bearer [REDACTED_CLIENT_SECRET]',
            sessionToken: 'sess_live_e9a8f2c3'
          }))
        }
      },
      {
        id: 'ticket-fb-1043',
        tenant_id: tenantAId,
        product_id: 'prod-dashboard',
        product_name: 'Merchant Admin Portal',
        short_code: 'FB-1043',
        title: 'Tax invoice PDF download button unresponsive on Chrome iOS',
        description: 'Clicking Download Invoice on billing portal triggers a spinner but never initiates file download stream.',
        category: 'UI_GLITCH',
        severity: 'HIGH',
        status: 'OPEN',
        reporter_email: 'finance@partner-client.com',
        assigned_squad: 'Core Platform & API Squad',
        sla_due_at: new Date(now + 180 * 60000).toISOString(),
        created_at: new Date(now - 15 * 60000).toISOString(),
        updated_at: new Date(now - 15 * 60000).toISOString(),
        telemetry: {
          page_url: 'https://merchant.acme.com/billing/invoices/2026-Q1',
          app_version: 'v4.1.2',
          user_agent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15',
          viewport_dimensions: '820x1180',
          console_logs: [
            { type: 'warn', message: 'Blob URL revoked before download triggered', timestamp: '18:20:11' }
          ],
          network_errors: []
        }
      },
      {
        id: 'ticket-medsync-2001',
        tenant_id: tenantBId,
        product_id: 'prod-telehealth-portal',
        product_name: 'MedSync Telehealth Patient Web',
        short_code: 'MS-2001',
        title: 'HIPAA Audit Trail Sync Latency in Clinic Node',
        description: 'Audit logs for patient record lookups are delayed by 180 seconds during batch record ingestion.',
        category: 'PERFORMANCE',
        severity: 'HIGH',
        status: 'OPEN',
        reporter_email: 'compliance@medsync.io',
        assigned_squad: 'COMPLIANCE_ENG',
        assigned_to: 'user-medsync-dev-01',
        assigned_to_name: 'Elena Rostova',
        sla_due_at: new Date(now + 120 * 60000).toISOString(),
        created_at: new Date(now - 60 * 60000).toISOString(),
        updated_at: new Date(now - 30 * 60000).toISOString(),
        telemetry: {
          page_url: 'https://ehr.medsync.io/audit/sync',
          app_version: 'v1.8.0',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          viewport_dimensions: '1920x1080',
          console_logs: [],
          network_errors: []
        }
      },
      {
        id: 'ticket-1041',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1041',
        title: 'BUG: Feedback from checkout.acme.com',
        description: 'Customer encountered error during checkout payment flow. Form validation and payment token gateway threw HTTP 500.',
        category: 'BUG',
        severity: 'MEDIUM',
        status: 'OPEN',
        reporter_email: 'sarah.jenkins@clientops.acme.com',
        assigned_squad: 'Checkout & Billing Squad',
        assigned_to: undefined,
        assigned_to_name: undefined,
        domain_origin: 'checkout.acme.com',
        telemetry: {
          page_url: 'https://checkout.acme.com/pay',
          domain_origin: 'checkout.acme.com',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport_dimensions: '1358x636',
          console_logs: [
            { type: 'error', message: 'Failed to load resource: the server responded with a status of 500', timestamp: '18:31:01' },
            { type: 'warn', message: 'Transaction state reset to unconfirmed', timestamp: '18:31:02' }
          ],
          network_errors: [
            { url: 'https://checkout.acme.com/api/v1/payments/charge', status: 500, method: 'POST', timestamp: '18:31:02' }
          ]
        },
        sla_due_at: new Date(now + 119 * 60000).toISOString(),
        created_at: new Date(now - 8 * 60000).toISOString(),
        updated_at: new Date(now - 8 * 60000).toISOString()
      },
      {
        id: 'ticket-1042',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1042',
        title: 'Webhook HMAC Signature Fails on Idempotent Retry',
        description: 'Timestamp drift causes HMAC-SHA256 signature verification to reject idempotent retry events sent by the automated retry queue.',
        category: 'BUG',
        severity: 'CRITICAL',
        status: 'IN_DEV',
        reporter_email: 'ops-monitoring@acme.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-lead-01',
        assigned_to_name: 'Vikram Mehta (API Squad Lead)',
        domain_origin: 'payments.acme.com',
        telemetry: {
          page_url: 'https://payments.acme.com/v1/webhooks/health',
          domain_origin: 'payments.acme.com',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
          viewport_dimensions: '1920x1080',
          console_logs: [
            { type: 'error', message: 'CryptoSignatureMismatch: header x-signature does not match computed HMAC', timestamp: '11:15:22' }
          ],
          network_errors: [
            { url: 'https://payments.acme.com/v1/webhooks/verify', status: 502, method: 'POST', timestamp: '11:15:22' }
          ]
        },
        sla_due_at: new Date(now + 60 * 60000).toISOString(),
        created_at: new Date(now - 120 * 60000).toISOString(),
        updated_at: new Date(now - 15 * 60000).toISOString()
      },
      {
        id: 'ticket-1043',
        tenant_id: tenantAId,
        product_id: 'prod-dashboard',
        product_name: 'Merchant Admin Portal',
        short_code: 'FB-1043',
        title: 'Merchant Settlement Reconciliation Discrepancy in EUR/USD Export',
        description: 'Rounding discrepancy of $0.01 observed on EUR/USD currency conversion when generating monthly settlement ledger CSV for European merchants.',
        category: 'BUG',
        severity: 'HIGH',
        status: 'IN_QA',
        reporter_email: 'accounting@merchant-partner.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-dev-02',
        assigned_to_name: 'Priya Nair (Frontend Platform Dev)',
        domain_origin: 'merchant.acme.com',
        telemetry: {
          page_url: 'https://merchant.acme.com/reports/settlement',
          domain_origin: 'merchant.acme.com',
          user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          viewport_dimensions: '1680x1050'
        },
        sla_due_at: new Date(now + 120 * 60000).toISOString(),
        created_at: new Date(now - 180 * 60000).toISOString(),
        updated_at: new Date(now - 40 * 60000).toISOString()
      },
      {
        id: 'ticket-1044',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1044',
        title: 'Session Cookie SameSite Blocks 3DS Authentication Redirect',
        description: 'Strict SameSite cookie attribute prevented bank OTP redirect from completing in embedded iframe. Hotfix deployed to use SameSite=None; Secure.',
        category: 'BUG',
        severity: 'HIGH',
        status: 'RESOLVED',
        reporter_email: 'qa-engineer@acme.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-dev-01',
        assigned_to_name: 'Rahul Sharma (Senior Backend Dev)',
        domain_origin: 'checkout.acme.com',
        sla_due_at: new Date(now - 100 * 60000).toISOString(),
        created_at: new Date(now - 300 * 60000).toISOString(),
        updated_at: new Date(now - 30 * 60000).toISOString()
      },
      {
        id: 'ticket-1045',
        tenant_id: tenantAId,
        product_id: 'prod-dashboard',
        product_name: 'Merchant Admin Portal',
        short_code: 'FB-1045',
        title: 'Bulk Refund Processing via CSV Upload in Admin Portal',
        description: 'Tier-1 merchants requesting ability to batch refund chargebacks by uploading standardized CSV template directly through the dashboard.',
        category: 'IDEA',
        severity: 'MEDIUM',
        status: 'IN_DEV',
        reporter_email: 'ops-manager@acme.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-dev-03',
        assigned_to_name: 'Amit Patel (Full-Stack Reliability Dev)',
        domain_origin: 'merchant.acme.com',
        sla_due_at: new Date(now + 24 * 3600000).toISOString(),
        created_at: new Date(now - 400 * 60000).toISOString(),
        updated_at: new Date(now - 50 * 60000).toISOString()
      },
      {
        id: 'ticket-1046',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1046',
        title: 'Native Dark Mode Theme for Embedded Widget',
        description: 'Auto-detection of host application prefers-color-scheme media query for seamless dark UI embedding in modern applications.',
        category: 'IDEA',
        severity: 'LOW',
        status: 'CLOSED',
        reporter_email: 'design-systems@acme.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-dev-02',
        assigned_to_name: 'Priya Nair (Frontend Platform Dev)',
        domain_origin: 'checkout.acme.com',
        sla_due_at: new Date(now - 120 * 60000).toISOString(),
        created_at: new Date(now - 800 * 60000).toISOString(),
        updated_at: new Date(now - 120 * 60000).toISOString()
      },
      {
        id: 'ticket-1047',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1047',
        title: 'Checkout Experience: 5 Star Review from Verified Buyer',
        description: 'Instant UPI payment QR code generated and settled in under 280ms. Exceptional mobile checkout speed on iOS Safari.',
        category: 'RATING',
        rating: 5,
        severity: 'LOW',
        status: 'RESOLVED',
        reporter_email: 'buyer.verified@gmail.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-lead-01',
        assigned_to_name: 'Vikram Mehta (API Squad Lead)',
        domain_origin: 'checkout.acme.com',
        sla_due_at: new Date(now - 60 * 60000).toISOString(),
        created_at: new Date(now - 250 * 60000).toISOString(),
        updated_at: new Date(now - 60 * 60000).toISOString()
      },
      {
        id: 'ticket-1048',
        tenant_id: tenantAId,
        product_id: 'prod-checkout-gateway',
        product_name: 'Checkout Gateway API & SDK',
        short_code: 'FB-1048',
        title: 'Custom Domain SSL Handshake DNS Records Assistance',
        description: 'Need verification DNS TXT and CNAME records for enterprise custom domain routing SSL certificate automated provisioning.',
        category: 'HELP',
        severity: 'MEDIUM',
        status: 'OPEN',
        reporter_email: 'infra-lead@acme.com',
        assigned_squad: 'Core Platform & API Squad',
        assigned_to: 'user-dev-03',
        assigned_to_name: 'Amit Patel (Full-Stack Reliability Dev)',
        domain_origin: 'payments.acme.com',
        sla_due_at: new Date(now + 60 * 60000).toISOString(),
        created_at: new Date(now - 90 * 60000).toISOString(),
        updated_at: new Date(now - 90 * 60000).toISOString()
      },
      // Tenant B (MedSync Healthcare) Isolated Incident
      {
        id: 'ticket-2001',
        tenant_id: tenantBId,
        product_id: 'prod-telehealth-portal',
        product_name: 'MedSync Telehealth Patient Web',
        short_code: 'FB-2001',
        title: 'EHR FHIR API Integration Timeout During Patient Discharge',
        description: 'Discharge summary sync fails intermittently with 504 Gateway Timeout when synchronizing HL7 records to hospital server.',
        category: 'BUG',
        severity: 'CRITICAL',
        status: 'OPEN',
        reporter_email: 'clinical-ops@medsync.io',
        assigned_squad: 'Clinical Telehealth Squad',
        domain_origin: 'portal.medsync.io',
        sla_due_at: new Date(now + 30 * 60000).toISOString(),
        created_at: new Date(now - 120 * 60000).toISOString(),
        updated_at: new Date(now - 120 * 60000).toISOString()
      }
    ];

    const sampleEvents: TicketEvent[] = [
      {
        id: 'ev-1',
        ticket_id: 'ticket-1041',
        tenant_id: tenantAId,
        author_name: 'Automated Ingestion Bridge',
        author_role: 'super_admin',
        event_type: 'STATUS_CHANGE',
        content: 'Incident ingested via client SDK from checkout.acme.com. High-severity triage alert dispatched to Core Platform & API Squad.',
        is_internal_only: false,
        created_at: new Date(now - 45 * 60000).toISOString()
      },
      {
        id: 'ev-2',
        ticket_id: 'ticket-1041',
        tenant_id: tenantAId,
        author_name: 'Vikram Mehta (API Squad Lead)',
        author_role: 'squad_lead',
        event_type: 'ASSIGNED',
        content: 'Ticket assigned to Rahul Sharma for urgent investigation on Safari 17.4 device lab.',
        is_internal_only: false,
        created_at: new Date(now - 20 * 60000).toISOString()
      },
      {
        id: 'ev-3',
        ticket_id: 'ticket-1044',
        tenant_id: tenantAId,
        author_name: 'Rahul Sharma (Senior Backend Dev)',
        author_role: 'developer',
        event_type: 'DEV_NOTE',
        content: 'Root cause identified: Cookie attribute was missing partitioned flag for cross-site iframe embedding. Tested and deployed to production.',
        is_internal_only: true,
        created_at: new Date(now - 40 * 60000).toISOString()
      },
      {
        id: 'ev-4',
        ticket_id: 'ticket-1044',
        tenant_id: tenantAId,
        author_name: 'Rahul Sharma (Senior Backend Dev)',
        author_role: 'developer',
        event_type: 'STATUS_CHANGE',
        content: 'Status advanced from IN_QA to RESOLVED. Verified 100% 3DS conversion rate restored.',
        is_internal_only: false,
        created_at: new Date(now - 30 * 60000).toISOString()
      },
      {
        id: 'ev-01',
        ticket_id: 'ticket-fb-1042',
        tenant_id: tenantAId,
        author_name: 'Rahul Sharma',
        author_role: 'developer',
        event_type: 'DEV_NOTE',
        content: 'Investigated Redis connection pool in Settlement microservice. It timed out due to slow socket read on banking partner node. Rolling out pool sizing hotfix to staging.',
        is_internal_only: true,
        created_at: new Date(now - 20 * 60000).toISOString()
      },
      {
        id: 'ev-02',
        ticket_id: 'ticket-fb-1042',
        tenant_id: tenantAId,
        author_name: 'Vikram Mehta',
        author_role: 'squad_lead',
        event_type: 'CLIENT_REPLY',
        content: 'Our core API team is actively applying a backend hotfix to resolve the gateway delay. Next status update in 20 minutes.',
        is_internal_only: false,
        created_at: new Date(now - 12 * 60000).toISOString()
      },
      {
        id: 'ev-medsync-01',
        ticket_id: 'ticket-medsync-2001',
        tenant_id: tenantBId,
        author_name: 'Elena Rostova',
        author_role: 'developer',
        event_type: 'DEV_NOTE',
        content: 'Configured secondary Redis replica for HIPAA audit buffering.',
        is_internal_only: true,
        created_at: new Date(now - 25 * 60000).toISOString()
      }
    ];

    if (this.tickets.length === 0) {
      this.tickets = sampleTickets;
    } else {
      for (const st of sampleTickets) {
        if (!this.tickets.some(t => t.id === st.id)) {
          this.tickets.push(st);
        }
      }
    }

    if (this.events.length === 0) {
      this.events = sampleEvents;
    } else {
      for (const se of sampleEvents) {
        if (!this.events.some(e => e.id === se.id)) {
          this.events.push(se);
        }
      }
    }
  }

  public getPermissionsMatrix(tenantId: string): RolePermissionsMatrix {
    if (!this.permissionsMatrix[tenantId]) {
      this.permissionsMatrix[tenantId] = createDefaultPermissionsMatrix();
    }
    return this.permissionsMatrix[tenantId];
  }

  public hasPermission(tenantId: string, role: UserRole, permissionKey: PermissionKey): boolean {
    if (role === 'super_admin') {
      return true;
    }
    // Prevent tenant_admin and squad_lead (Lead Manager) from being locked out of permissions governance
    if ((role === 'tenant_admin' || role === 'squad_lead') && (permissionKey === 'permissions:edit' || permissionKey === 'permissions:reset' || permissionKey === 'permissions:view')) {
      return true;
    }

    // Strict constraint: Developer and non-admin/lead roles cannot perform any settings changes
    const SETTINGS_CHANGE_PERMISSIONS: PermissionKey[] = [
      'tenant:edit_profile',
      'tenant:manage_domains',
      'tenant:manage_policies',
      'products:create',
      'products:edit',
      'products:rotate_keys',
      'products:delete',
      'permissions:edit',
      'permissions:reset',
      'audit:test_bridge'
    ];
    const isAdminOrLead = ['super_admin', 'tenant_admin', 'squad_lead'].includes(role);
    if (!isAdminOrLead && SETTINGS_CHANGE_PERMISSIONS.includes(permissionKey)) {
      return false;
    }

    const matrix = this.getPermissionsMatrix(tenantId);
    const rolePerms = matrix[role];
    if (!rolePerms) {
      return false;
    }
    return Boolean(rolePerms[permissionKey]);
  }

  public updateRolePermissions(
    tenantId: string, 
    role: UserRole, 
    permissions: Partial<Record<PermissionKey, boolean>>
  ): RolePermissionsMatrix {
    const matrix = this.getPermissionsMatrix(tenantId);
    if (!matrix[role]) {
      matrix[role] = { ...DEFAULT_ROLE_PERMISSIONS[role] };
    }
    matrix[role] = {
      ...matrix[role],
      ...permissions
    };
    return matrix;
  }

  public resetRolePermissions(tenantId: string, targetRole?: UserRole): RolePermissionsMatrix {
    const matrix = this.getPermissionsMatrix(tenantId);
    if (targetRole) {
      matrix[targetRole] = { ...DEFAULT_ROLE_PERMISSIONS[targetRole] };
    } else {
      for (const role of ALL_ROLES) {
        matrix[role] = { ...DEFAULT_ROLE_PERMISSIONS[role] };
      }
    }
    return matrix;
  }

  /**
   * Initializes development-only password hashes for mock users.
   * Clearly identified for development/testing only; never used in production.
   */
  public async ensureDevSeedCredentials(hashFn: (password: string) => Promise<string>, devPassword = 'TestPassword123!') {
    const devHash = await hashFn(devPassword);
    for (const user of this.users) {
      if (!user.password_hash) {
        user.password_hash = devHash;
      }
    }
  }
}

export const tenantStore = new MultiTenantStore();

/**
 * Persist role permissions to live PostgreSQL database if connected.
 */
export async function persistRolePermissionsToDb(
  tenantId: string, 
  role: UserRole, 
  permissions: Record<PermissionKey, boolean>
) {
  if (!isPostgresConnected) return;

  try {
    for (const [key, isGranted] of Object.entries(permissions)) {
      const def = PERMISSION_DEFINITIONS.find(p => p.key === key);
      const moduleName = def?.module || key.split(':')[0] || 'general';
      const actionName = def?.action || key.split(':')[1] || 'action';
      const desc = def?.description || '';

      await pool.query(
        `INSERT INTO role_permissions (tenant_id, role, permission_key, module, action, description, is_granted, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (tenant_id, role, permission_key)
         DO UPDATE SET is_granted = $7, updated_at = NOW()`,
        [tenantId, role, key, moduleName, actionName, desc, isGranted]
      );
    }
  } catch (err) {
    console.error('[Database Permissions Persist Error]', err);
  }
}

/**
 * Synchronize role permissions from live PostgreSQL database into in-memory store.
 */
export async function loadRolePermissionsFromDb(tenantId: string): Promise<void> {
  if (!isPostgresConnected) return;

  try {
    const res = await pool.query(
      `SELECT role, permission_key, is_granted FROM role_permissions WHERE tenant_id = $1`,
      [tenantId]
    );

    if (res.rows.length > 0) {
      const matrix = tenantStore.getPermissionsMatrix(tenantId);
      for (const row of res.rows) {
        const role = row.role as UserRole;
        const key = row.permission_key as PermissionKey;
        if (matrix[role]) {
          matrix[role][key] = Boolean(row.is_granted);
        }
      }
    }
  } catch (err) {
    console.error('[Database Permissions Load Error]', err);
  }
}

// Attempt test connection to Postgres
pool.query('SELECT NOW()')
  .then(async () => {
    isPostgresConnected = true;
    console.log('[Database] Connected to PostgreSQL successfully.');
    await loadRolePermissionsFromDb('tenant-acme-corp-001');
    await loadRolePermissionsFromDb('tenant-medsync-002');
  })
  .catch((err: any) => {
    isPostgresConnected = false;
    if (ENV.NODE_ENV === 'production') {
      console.error('[CRITICAL DATABASE ERROR] Failed to connect to PostgreSQL in production mode:', err?.message || err);
    } else {
      console.log('[Database] Operating with Persistent Disk Database (feedback_hub_db.json). Zero data loss on refresh.');
    }
  });

/**
 * Executes a callback within a managed PostgreSQL transaction client if connected.
 * In development without PostgreSQL, runs safely against the in-memory store.
 * In production, strictly throws if PostgreSQL is not connected (no silent in-memory fallback).
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient | null) => Promise<T>
): Promise<T> {
  if (isPostgresConnected) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  if (ENV.NODE_ENV === 'production') {
    throw new Error(
      '[CRITICAL DATABASE ERROR] PostgreSQL connection required in production mode. In-memory storage fallback is disabled.'
    );
  }

  // Development/Test fallback with transactional snapshot rollback support
  const snapshotTokens = tenantStore.refreshTokens.map(t => ({ ...t }));
  const snapshotUsers = tenantStore.users.map(u => ({ ...u }));
  const snapshotResetTokens = tenantStore.passwordResetTokens.map(t => ({ ...t }));
  try {
    return await callback(null);
  } catch (error) {
    tenantStore.refreshTokens = snapshotTokens;
    tenantStore.users = snapshotUsers;
    tenantStore.passwordResetTokens = snapshotResetTokens;
    throw error;
  }
}
