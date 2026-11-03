import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { ENV } from './env.js';
import { Tenant, User, Product, Ticket, TicketEvent, UserRole, PermissionKey, RolePermissionsMatrix, RefreshTokenRecord, PasswordResetTokenRecord } from '../types/index.js';
import { encryptSensitiveData } from '../services/crypto.js';
import { createDefaultPermissionsMatrix, DEFAULT_ROLE_PERMISSIONS, ALL_ROLES, PERMISSION_DEFINITIONS } from './permissions.js';

const { Pool } = pg;

// Auto-detect and configure Supabase Session Pooler
let connectionString = ENV.DATABASE_URL || '';
if (connectionString.includes('pooler.supabase.com:5432')) {
  connectionString = connectionString.replace(':5432/', ':6543/');
}

const isSupabase = connectionString.includes('supabase.com');

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

// Flag indicating if live Postgres connection is established
export let isPostgresConnected = false;

// Multi-tenant UUID and Text Mapping Dictionary
export const TENANT_TEXT_TO_UUID: Record<string, string> = {
  'tenant-acme-corp-001': '00000000-0000-4000-8000-000000000001',
  'tenant-medsync-002': '00000000-0000-4000-8000-000000000002',
  'acme-payments': '00000000-0000-4000-8000-000000000001',
  'medsync': '00000000-0000-4000-8000-000000000002'
};

export const TENANT_UUID_TO_TEXT: Record<string, string> = {
  '00000000-0000-4000-8000-000000000001': 'tenant-acme-corp-001',
  '00000000-0000-4000-8000-000000000002': 'tenant-medsync-002'
};

export function toTenantUuid(tenantId: string): string {
  if (TENANT_TEXT_TO_UUID[tenantId]) return TENANT_TEXT_TO_UUID[tenantId];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return tenantId;
  }
  return '00000000-0000-4000-8000-000000000001';
}

export function toTenantTextId(tenantId: string): string {
  if (TENANT_UUID_TO_TEXT[tenantId]) return TENANT_UUID_TO_TEXT[tenantId];
  return tenantId;
}


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
      this.saveToDisk();
    } else {
      let changed = false;
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
        refreshTokens: this.refreshTokens,
        passwordResetTokens: this.passwordResetTokens,
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
          this.refreshTokens = Array.isArray(data.refreshTokens)
            ? data.refreshTokens.map((r: any) => ({
              ...r,
              expires_at: new Date(r.expires_at),
              created_at: new Date(r.created_at)
            }))
            : [];
          this.passwordResetTokens = Array.isArray(data.passwordResetTokens)
            ? data.passwordResetTokens.map((p: any) => ({
              ...p,
              expires_at: new Date(p.expires_at),
              created_at: new Date(p.created_at),
              used_at: p.used_at ? new Date(p.used_at) : null
            }))
            : [];
          this.permissionsMatrix = data.permissionsMatrix || {};
          // Ensure developer role has tickets:delete aligned with active permissions
          for (const tKey of Object.keys(this.permissionsMatrix)) {
            if (this.permissionsMatrix[tKey]?.developer) {
              this.permissionsMatrix[tKey].developer['tickets:delete'] = true;
            }
          }
          console.log(`[Database] Loaded persistent data: ${this.tickets.length} tickets, ${this.products.length} products, ${this.tenants.length} tenants, ${this.refreshTokens.length} active sessions.`);
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

  public getPermissionsMatrix(tenantId: string): RolePermissionsMatrix {
    const textId = toTenantTextId(tenantId);
    const uuid = toTenantUuid(tenantId);
    if (this.permissionsMatrix[textId]) return this.permissionsMatrix[textId];
    if (this.permissionsMatrix[uuid]) return this.permissionsMatrix[uuid];
    if (this.permissionsMatrix[tenantId]) return this.permissionsMatrix[tenantId];
    this.permissionsMatrix[textId] = createDefaultPermissionsMatrix();
    return this.permissionsMatrix[textId];
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

  const targetUuid = toTenantUuid(tenantId);
  const entries = Object.entries(permissions);
  if (entries.length === 0) return;

  try {
    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const [key, isGranted] of entries) {
      const def = PERMISSION_DEFINITIONS.find(p => p.key === key);
      const moduleName = def?.module || key.split(':')[0] || 'general';
      const actionName = def?.action || key.split(':')[1] || 'action';
      const desc = def?.description || '';

      valuePlaceholders.push(`(${pIdx}, ${pIdx + 1}, ${pIdx + 2}, ${pIdx + 3}, ${pIdx + 4}, ${pIdx + 5}, ${pIdx + 6}, NOW())`);
      values.push(targetUuid, role, key, moduleName, actionName, desc, Boolean(isGranted));
      pIdx += 7;
    }

    const query = `
      INSERT INTO role_permissions (tenant_id, role, permission_key, module, action, description, is_granted, updated_at)
      VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (tenant_id, role, permission_key)
      DO UPDATE SET is_granted = EXCLUDED.is_granted, updated_at = NOW()
    `;

    await pool.query(query, values);
  } catch (err) {
    console.error('[Database Permissions Persist Error]', err);
  }
}

/**
 * Persist an entire multi-role permissions matrix to live PostgreSQL database in a single batch query.
 */
export async function persistFullMatrixToDb(
  tenantId: string,
  matrix: RolePermissionsMatrix
) {
  if (!isPostgresConnected) return;

  const targetUuid = toTenantUuid(tenantId);
  try {
    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const [role, perms] of Object.entries(matrix)) {
      if (!perms || typeof perms !== 'object') continue;
      for (const [key, isGranted] of Object.entries(perms as Record<string, boolean>)) {
        const def = PERMISSION_DEFINITIONS.find(p => p.key === key);
        const moduleName = def?.module || key.split(':')[0] || 'general';
        const actionName = def?.action || key.split(':')[1] || 'action';
        const desc = def?.description || '';

        valuePlaceholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3}, $${pIdx + 4}, $${pIdx + 5}, $${pIdx + 6}, NOW())`);
        values.push(targetUuid, role, key, moduleName, actionName, desc, Boolean(isGranted));
        pIdx += 7;
      }
    }

    if (valuePlaceholders.length > 0) {
      const query = `
        INSERT INTO role_permissions (tenant_id, role, permission_key, module, action, description, is_granted, updated_at)
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (tenant_id, role, permission_key)
        DO UPDATE SET is_granted = EXCLUDED.is_granted, updated_at = NOW()
      `;
      await pool.query(query, values);
    }
  } catch (err) {
    console.error('[Database Full Matrix Persist Error]', err);
  }
}

/**
 * Synchronize role permissions from live PostgreSQL database into in-memory store.
 */
export async function loadRolePermissionsFromDb(tenantId: string): Promise<void> {
  if (!isPostgresConnected) return;

  const targetUuid = toTenantUuid(tenantId);
  try {
    const res = await pool.query(
      `SELECT role, permission_key, is_granted FROM role_permissions WHERE tenant_id = $1`,
      [targetUuid]
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

/**
 * Synchronize live records from Supabase PostgreSQL into memory/cache.
 */
export async function syncFromSupabase(): Promise<void> {
  if (!isPostgresConnected) return;
  try {
    console.log('[Supabase Sync] Fetching dynamic live records from Supabase...');

    // 1. Fetch live dynamic tickets & telemetry from Supabase
    const ticketsRes = await pool.query(`
      SELECT 
        t.id,
        t.tenant_id,
        t.product_id,
        p.name AS product_name,
        t.short_code,
        t.title,
        t.description,
        t.category,
        t.severity,
        t.status,
        t.reporter_email,
        t.assigned_squad,
        t.assigned_to,
        t.assigned_to_name,
        t.domain_origin,
        t.rating,
        t.sla_due_at,
        t.created_at,
        t.updated_at,
        tm.page_url,
        tm.app_version,
        tm.user_agent,
        tm.viewport_dimensions,
        tm.console_logs,
        tm.network_errors,
        tm.encrypted_sensitive_data
      FROM tickets t
      LEFT JOIN products p ON t.product_id = p.id
      LEFT JOIN ticket_telemetry tm ON t.id = tm.ticket_id
      ORDER BY t.created_at DESC;
    `);

    tenantStore.tickets = ticketsRes.rows.map(row => ({
      id: row.id,
      tenant_id: toTenantTextId(row.tenant_id),
      product_id: row.product_id,
      product_name: row.product_name || 'Core Platform & Telemetry',
      domain_origin: row.domain_origin || undefined,
      short_code: row.short_code,
      title: row.title,
      description: row.description,
      category: row.category,
      severity: row.severity,
      status: row.status,
      rating: row.rating ? Number(row.rating) : undefined,
      reporter_email: row.reporter_email,
      assigned_squad: row.assigned_squad,
      assigned_to: row.assigned_to || undefined,
      assigned_to_name: row.assigned_to_name || undefined,
      sla_due_at: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : new Date().toISOString(),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      telemetry: row.page_url ? {
        page_url: row.page_url,
        app_version: row.app_version,
        user_agent: row.user_agent,
        viewport_dimensions: row.viewport_dimensions,
        console_logs: row.console_logs || [],
        network_errors: row.network_errors || [],
        encrypted_sensitive_data: row.encrypted_sensitive_data
      } : undefined
    }));
    console.log(`[Supabase Sync] Dynamic tickets loaded from Supabase: ${tenantStore.tickets.length}`);

    // 2. Fetch live events from Supabase
    const eventsRes = await pool.query(`
      SELECT te.id, te.ticket_id, te.tenant_id, te.event_type, te.content, te.is_internal_only, te.created_at, u.full_name AS author_name, u.role AS author_role
      FROM ticket_events te
      LEFT JOIN users u ON te.author_id = u.id
      ORDER BY te.created_at ASC;
    `);
    tenantStore.events = eventsRes.rows.map(row => ({
      id: row.id,
      ticket_id: row.ticket_id,
      tenant_id: toTenantTextId(row.tenant_id),
      author_name: row.author_name || 'Team Member',
      author_role: row.author_role || 'developer',
      event_type: row.event_type,
      content: row.content,
      is_internal_only: Boolean(row.is_internal_only),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    }));

    tenantStore.saveToDisk();

    // 3. Load role permissions
    await loadRolePermissionsFromDb('tenant-acme-corp-001');
    await loadRolePermissionsFromDb('tenant-medsync-002');
  } catch (syncErr) {
    console.error('[Supabase Sync Error]', syncErr);
  }
}

// Attempt test connection to Postgres
async function connectToDatabase(retries = 3, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT NOW()');
      isPostgresConnected = true;
      console.log('[Database] Connected to PostgreSQL (Supabase) successfully.');
      await syncFromSupabase();
      return;
    } catch (err: any) {
      if (attempt === retries) {
        isPostgresConnected = false;
        if (ENV.NODE_ENV === 'production') {
          console.error('[CRITICAL DATABASE ERROR] Failed to connect to PostgreSQL in production mode:', err?.message || err);
        } else {
          console.log('[Database] Operating with Persistent Disk Database (feedback_hub_db.json). Zero data loss on refresh.');
        }
      } else {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
}
connectToDatabase();

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
