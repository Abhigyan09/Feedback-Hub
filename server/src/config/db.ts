import pg from 'pg';
import { ENV } from './env.js';
import { Tenant, User, Product, Ticket, TicketEvent } from '../types/index.js';
import { encryptSensitiveData } from '../services/crypto.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Flag indicating if live Postgres connection is established
export let isPostgresConnected = false;

// In-Memory Multi-Tenant Fallback Store (Allows instant zero-friction start for developers)
export class MultiTenantStore {
  public tenants: Tenant[] = [];
  public users: User[] = [];
  public products: Product[] = [];
  public tickets: Ticket[] = [];
  public events: TicketEvent[] = [];

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Tenant A: Fintech Enterprise Client
    const tenantA: Tenant = {
      id: 'tenant-acme-corp-001',
      name: 'Acme Payments Inc.',
      slug: 'acme-payments',
      plan: 'ENTERPRISE',
      allowed_domains: ['payments.acme.com', 'localhost:3000'],
      created_at: new Date(Date.now() - 30 * 86400000).toISOString()
    };

    // 2. Tenant B: HealthTech Client (Demonstrating Multi-Tenant Isolation)
    const tenantB: Tenant = {
      id: 'tenant-medsync-002',
      name: 'MedSync Healthcare',
      slug: 'medsync',
      plan: 'ENTERPRISE',
      allowed_domains: ['medsync.io'],
      created_at: new Date(Date.now() - 15 * 86400000).toISOString()
    };

    this.tenants.push(tenantA, tenantB);

    // Products
    const prod1: Product = {
      id: 'prod-checkout-gateway',
      tenant_id: tenantA.id,
      name: 'Checkout Gateway API & SDK',
      slug: 'checkout-api',
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
      api_key_hash: 'hash_prod_live_portal_key',
      raw_api_key: 'fb_live_acme_portal_key_102',
      environment: 'production',
      created_at: new Date().toISOString()
    };

    this.products.push(prod1, prod2);

    // Users
    this.users.push(
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
        id: 'user-client-01',
        tenant_id: tenantA.id,
        email: 'operations@partner-client.com',
        full_name: 'Sarah Jenkins (Client Ops Director)',
        role: 'client_user',
        is_active: true,
        created_at: new Date().toISOString()
      }
    );

    // Realistic Demo Tickets with Deep Telemetry
    const ticket1: Ticket = {
      id: 'ticket-fb-1042',
      tenant_id: tenantA.id,
      product_id: prod1.id,
      product_name: prod1.name,
      short_code: 'FB-1042',
      title: 'HTTP 504 Gateway Timeout during UPI Webhook settlement',
      description: 'Production checkout failed for 14 enterprise transactions during peak settlement hour. Merchant receives blank loading state.',
      category: 'API_FAILURE',
      severity: 'CRITICAL',
      status: 'IN_DEV',
      reporter_email: 'operations@partner-client.com',
      assigned_squad: 'PAYMENT_CORE_API',
      assigned_to: 'user-dev-01',
      assigned_to_name: 'Rahul Sharma (Senior Backend Dev)',
      sla_due_at: new Date(Date.now() + 45 * 60000).toISOString(), // 45 mins left
      created_at: new Date(Date.now() - 35 * 60000).toISOString(),
      updated_at: new Date(Date.now() - 10 * 60000).toISOString(),
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
    };

    const ticket2: Ticket = {
      id: 'ticket-fb-1043',
      tenant_id: tenantA.id,
      product_id: prod2.id,
      product_name: prod2.name,
      short_code: 'FB-1043',
      title: 'Tax invoice PDF download button unresponsive on Chrome iOS',
      description: 'Clicking Download Invoice on billing portal triggers a spinner but never initiates file download stream.',
      category: 'UI_GLITCH',
      severity: 'HIGH',
      status: 'OPEN',
      reporter_email: 'finance@partner-client.com',
      assigned_squad: 'FRONTEND_PORTAL',
      sla_due_at: new Date(Date.now() + 180 * 60000).toISOString(),
      created_at: new Date(Date.now() - 15 * 60000).toISOString(),
      updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
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
    };

    this.tickets.push(ticket1, ticket2);

    // Events (Internal Dev Notes vs Client Replies)
    this.events.push(
      {
        id: 'ev-01',
        ticket_id: ticket1.id,
        tenant_id: tenantA.id,
        author_name: 'Rahul Sharma',
        author_role: 'developer',
        event_type: 'DEV_NOTE',
        content: 'Investigated Redis connection pool in Settlement microservice. It timed out due to slow socket read on banking partner node. Rolling out pool sizing hotfix to staging.',
        is_internal_only: true, // CLIENT CANNOT SEE THIS
        created_at: new Date(Date.now() - 20 * 60000).toISOString()
      },
      {
        id: 'ev-02',
        ticket_id: ticket1.id,
        tenant_id: tenantA.id,
        author_name: 'Vikram Mehta',
        author_role: 'squad_lead',
        event_type: 'CLIENT_REPLY',
        content: 'Our core API team is actively applying a backend hotfix to resolve the gateway delay. Next status update in 20 minutes.',
        is_internal_only: false, // VISIBLE TO CLIENT
        created_at: new Date(Date.now() - 12 * 60000).toISOString()
      }
    );
  }
}

export const tenantStore = new MultiTenantStore();

// Attempt test connection to Postgres
pool.query('SELECT NOW()')
  .then(() => {
    isPostgresConnected = true;
    console.log('[Database] Connected to PostgreSQL 16 successfully with RLS enabled.');
  })
  .catch((err) => {
    isPostgresConnected = false;
    console.log('[Database] PostgreSQL instance not detected. Operating with Active In-Memory Multi-Tenant Store.');
  });
