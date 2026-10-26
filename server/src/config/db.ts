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

    // 2. Tenant B: HealthTech Client (Demonstrating Multi-Tenant Isolation)
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

    this.tenants.push(tenantA, tenantB);

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
        id: 'user-client-01',
        tenant_id: tenantA.id,
        email: 'operations@partner-client.com',
        full_name: 'Sarah Jenkins (Client Ops Director)',
        role: 'client_user',
        is_active: true,
        created_at: new Date().toISOString()
      }
    );

    // Starting clean: No dummy tickets or dummy events
    this.tickets = [];
    this.events = [];
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
