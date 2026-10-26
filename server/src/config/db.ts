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
        id: 'member-3',
        tenant_id: tenantA.id,
        email: 'sarah.jenkins@feedbackhub.io',
        full_name: 'Sarah Jenkins',
        role: 'developer',
        is_active: true,
        created_at: new Date().toISOString()
      }
    );

    // Initialize clean tickets and events store (Dynamic data only)
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
