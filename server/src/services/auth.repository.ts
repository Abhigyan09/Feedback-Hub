import pg from 'pg';
import { pool, isPostgresConnected, tenantStore } from '../config/db.js';
import { ENV } from '../config/env.js';
import {
  Tenant,
  User,
  UserWithCredentials,
  RefreshTokenRecord,
  CreateRefreshTokenDTO,
  PasswordResetTokenRecord,
  CreatePasswordResetTokenDTO
} from '../types/index.js';

type ClientOrPool = pg.PoolClient | pg.Pool;

/**
 * Asserts that the database is safe to operate.
 * In production mode, silent fallback to in-memory store is strictly forbidden.
 */
function assertPersistenceMode() {
  if (!isPostgresConnected && ENV.NODE_ENV === 'production') {
    throw new Error(
      '[CRITICAL DATABASE ERROR] PostgreSQL connection required in production mode. In-memory storage fallback is disabled.'
    );
  }
}

// ==============================================================================
// 1. TENANT DATA ACCESS
// ==============================================================================

/**
 * Looks up an active tenant by its unique URL slug.
 * @param slug Tenant identifier (e.g. 'acme-payments')
 * @param client Optional transactional PoolClient
 */
export async function findTenantBySlug(
  slug: string,
  client?: pg.PoolClient | null
): Promise<Tenant | null> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT id, name, slug, plan, allowed_domains, created_at
      FROM tenants
      WHERE slug = $1 AND is_active = TRUE
      LIMIT 1;
    `;
    const res = await executor.query(query, [slug]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      allowed_domains: row.allowed_domains || [],
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    };
  }

  // Development/Test in-memory fallback
  const tenant = tenantStore.tenants.find(t => t.slug === slug);
  return tenant || null;
}

/**
 * Looks up a tenant by primary UUID.
 * @param id Tenant UUID
 * @param client Optional transactional PoolClient
 */
export async function findTenantById(
  id: string,
  client?: pg.PoolClient | null
): Promise<Tenant | null> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT id, name, slug, plan, allowed_domains, created_at
      FROM tenants
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1;
    `;
    const res = await executor.query(query, [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      allowed_domains: row.allowed_domains || [],
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    };
  }

  const tenant = tenantStore.tenants.find(t => t.id === id);
  return tenant || null;
}

// ==============================================================================
// 2. USER DATA ACCESS (STRICT TENANT-SCOPED QUERIES)
// ==============================================================================

/**
 * Looks up a user by email strictly within the specified tenant boundary.
 * Never searches globally by email to prevent cross-tenant identity confusion.
 * Retrieves password_hash, role, active status, and identity attributes.
 *
 * @param tenantId The validated tenant boundary ID
 * @param email Candidate user email (compared case-insensitively)
 * @param client Optional transactional PoolClient
 */
export async function findUserByTenantAndEmail(
  tenantId: string,
  email: string,
  client?: pg.PoolClient | null
): Promise<UserWithCredentials | null> {
  assertPersistenceMode();

  if (!tenantId || !email) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT id, tenant_id, email, password_hash, full_name, role, is_active, refresh_token_family_id, created_at
      FROM users
      WHERE tenant_id = $1 AND LOWER(email) = $2
      LIMIT 1;
    `;
    const res = await executor.query(query, [tenantId, normalizedEmail]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      email: row.email,
      password_hash: row.password_hash,
      full_name: row.full_name,
      role: row.role,
      is_active: Boolean(row.is_active),
      refresh_token_family_id: row.refresh_token_family_id,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    };
  }

  // Development/Test in-memory fallback
  const user = tenantStore.users.find(
    u => u.tenant_id === tenantId && u.email.toLowerCase() === normalizedEmail
  );

  if (!user || !user.password_hash) {
    return null;
  }

  return {
    ...user,
    password_hash: user.password_hash
  };
}

/**
 * Looks up a user by ID strictly within the specified tenant boundary.
 * @param tenantId Tenant boundary UUID
 * @param userId User UUID
 * @param client Optional transactional PoolClient
 */
export async function findUserById(
  tenantId: string,
  userId: string,
  client?: pg.PoolClient | null
): Promise<User | null> {
  assertPersistenceMode();

  if (!tenantId || !userId) return null;

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT id, tenant_id, email, full_name, role, is_active, refresh_token_family_id, created_at
      FROM users
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1;
    `;
    const res = await executor.query(query, [tenantId, userId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      is_active: Boolean(row.is_active),
      refresh_token_family_id: row.refresh_token_family_id,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    };
  }

  const user = tenantStore.users.find(u => u.tenant_id === tenantId && u.id === userId);
  return user || null;
}

// ==============================================================================
// 3. REFRESH TOKEN PERSISTENCE & CONCURRENCY CONTROLS
// ==============================================================================

/**
 * Creates and stores a new refresh token record.
 * Stores the SHA-256 token hash; raw refresh tokens are never persisted.
 *
 * @param data Refresh token attributes
 * @param client Optional transactional PoolClient
 */
export async function createRefreshToken(
  data: CreateRefreshTokenDTO,
  client?: pg.PoolClient | null
): Promise<RefreshTokenRecord> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, family_id, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, tenant_id, token_hash, family_id, is_revoked, expires_at, created_at, replaced_by_token_hash;
    `;
    const res = await executor.query(query, [
      data.user_id,
      data.tenant_id,
      data.token_hash,
      data.family_id,
      data.expires_at
    ]);
    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      tenant_id: row.tenant_id,
      token_hash: row.token_hash,
      family_id: row.family_id,
      is_revoked: Boolean(row.is_revoked),
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
      replaced_by_token_hash: row.replaced_by_token_hash || null
    };
  }

  // Development/Test in-memory fallback
  const record: RefreshTokenRecord = {
    id: `rt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    user_id: data.user_id,
    tenant_id: data.tenant_id,
    token_hash: data.token_hash,
    family_id: data.family_id,
    is_revoked: false,
    expires_at: data.expires_at,
    created_at: new Date(),
    replaced_by_token_hash: null
  };
  tenantStore.refreshTokens.push(record);
  return record;
}

/**
 * Finds a refresh token record by its SHA-256 hash.
 * @param tokenHash SHA-256 hash of the presented refresh token
 * @param client Optional transactional PoolClient
 */
export async function findRefreshTokenByHash(
  tokenHash: string,
  client?: pg.PoolClient | null
): Promise<RefreshTokenRecord | null> {
  assertPersistenceMode();

  if (!tokenHash) return null;

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT id, user_id, tenant_id, token_hash, family_id, is_revoked, expires_at, created_at, replaced_by_token_hash
      FROM refresh_tokens
      WHERE token_hash = $1
      LIMIT 1;
    `;
    const res = await executor.query(query, [tokenHash]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      tenant_id: row.tenant_id,
      token_hash: row.token_hash,
      family_id: row.family_id,
      is_revoked: Boolean(row.is_revoked),
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
      replaced_by_token_hash: row.replaced_by_token_hash || null
    };
  }

  const record = tenantStore.refreshTokens.find(r => r.token_hash === tokenHash);
  return record || null;
}

/**
 * Finds and row-locks a refresh token record within a transaction (`FOR UPDATE`).
 * Protects against concurrent token rotation race conditions in the rotation phase.
 *
 * @param tokenHash SHA-256 hash of the presented refresh token
 * @param client Transactional PoolClient (required for row-level lock)
 */
export async function findRefreshTokenForUpdate(
  tokenHash: string,
  client?: pg.PoolClient | null
): Promise<RefreshTokenRecord | null> {
  assertPersistenceMode();

  if (!tokenHash) return null;

  if (isPostgresConnected && client) {
    const query = `
      SELECT id, user_id, tenant_id, token_hash, family_id, is_revoked, expires_at, created_at, replaced_by_token_hash
      FROM refresh_tokens
      WHERE token_hash = $1
      FOR UPDATE;
    `;
    const res = await client.query(query, [tokenHash]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      tenant_id: row.tenant_id,
      token_hash: row.token_hash,
      family_id: row.family_id,
      is_revoked: Boolean(row.is_revoked),
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
      replaced_by_token_hash: row.replaced_by_token_hash || null
    };
  }

  // Fallback to standard lookup if in-memory or outside client lock
  return findRefreshTokenByHash(tokenHash, client);
}

/**
 * Revokes a single refresh token and optionally marks the replacement token hash.
 * @param tokenHash The SHA-256 hash of the token being rotated/revoked
 * @param replacedByTokenHash The hash of the newly issued replacement token (lineage tracking)
 * @param client Optional transactional PoolClient
 */
export async function revokeRefreshToken(
  tokenHash: string,
  replacedByTokenHash?: string,
  client?: pg.PoolClient | null
): Promise<boolean> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE,
          replaced_by_token_hash = COALESCE($2, replaced_by_token_hash)
      WHERE token_hash = $1;
    `;
    const res = await executor.query(query, [tokenHash, replacedByTokenHash || null]);
    return (res.rowCount ?? 0) > 0;
  }

  const record = tenantStore.refreshTokens.find(r => r.token_hash === tokenHash);
  if (!record) return false;
  record.is_revoked = true;
  if (replacedByTokenHash) {
    record.replaced_by_token_hash = replacedByTokenHash;
  }
  return true;
}

/**
 * Revokes an entire token family upon detecting token reuse or compromise.
 * Invalidates all past and present tokens associated with the session family.
 *
 * @param familyId The UUID of the compromised token family
 * @param client Optional transactional PoolClient
 * @returns Number of tokens invalidated
 */
export async function revokeTokenFamily(
  familyId: string,
  client?: pg.PoolClient | null
): Promise<number> {
  assertPersistenceMode();

  if (!familyId) return 0;

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE family_id = $1 AND is_revoked = FALSE;
    `;
    const res = await executor.query(query, [familyId]);
    return res.rowCount ?? 0;
  }

  let count = 0;
  for (const record of tenantStore.refreshTokens) {
    if (record.family_id === familyId && !record.is_revoked) {
      record.is_revoked = true;
      count++;
    }
  }
  return count;
}

/**
 * Checks whether any token in a family has been marked as revoked.
 * Useful for fast-path reuse compromise detection.
 *
 * @param familyId The family UUID
 * @param client Optional transactional PoolClient
 */
export async function isFamilyRevoked(
  familyId: string,
  client?: pg.PoolClient | null
): Promise<boolean> {
  assertPersistenceMode();

  if (!familyId) return false;

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT 1 FROM refresh_tokens
      WHERE family_id = $1 AND is_revoked = TRUE
      LIMIT 1;
    `;
    const res = await executor.query(query, [familyId]);
    return res.rows.length > 0;
  }

  return tenantStore.refreshTokens.some(r => r.family_id === familyId && r.is_revoked);
}

// ==============================================================================
// 4. PASSWORD RESET DATA ACCESS
// ==============================================================================

/**
 * Finds an active user by email across tenants or within a tenant.
 */
export async function findUserByEmail(
  email: string,
  tenantSlug?: string,
  client?: pg.PoolClient | null
): Promise<{ user: UserWithCredentials; tenant: Tenant } | null> {
  assertPersistenceMode();
  if (!email || !email.trim()) return null;

  const normalizedEmail = email.trim().toLowerCase();

  if (tenantSlug) {
    const tenant = await findTenantBySlug(tenantSlug, client);
    if (!tenant) return null;
    const user = await findUserByTenantAndEmail(tenant.id, normalizedEmail, client);
    if (!user) return null;
    return { user, tenant };
  }

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name, u.role, u.is_active, u.refresh_token_family_id, u.created_at,
             t.id as t_id, t.name as t_name, t.slug as t_slug, t.plan as t_plan, t.allowed_domains as t_allowed_domains, t.created_at as t_created_at
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE LOWER(u.email) = $1 AND u.is_active = TRUE AND t.is_active = TRUE
      LIMIT 1;
    `;
    const res = await executor.query(query, [normalizedEmail]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      user: {
        id: row.id,
        tenant_id: row.tenant_id,
        email: row.email,
        password_hash: row.password_hash,
        full_name: row.full_name,
        role: row.role,
        is_active: Boolean(row.is_active),
        refresh_token_family_id: row.refresh_token_family_id,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
      },
      tenant: {
        id: row.t_id,
        name: row.t_name,
        slug: row.t_slug,
        plan: row.t_plan,
        allowed_domains: row.t_allowed_domains || [],
        created_at: row.t_created_at ? new Date(row.t_created_at).toISOString() : new Date().toISOString()
      }
    };
  }

  // Development in-memory fallback
  const user = tenantStore.users.find(u => u.email.toLowerCase() === normalizedEmail && u.is_active);
  if (!user || !user.password_hash) return null;
  const tenant = tenantStore.tenants.find(t => t.id === user.tenant_id);
  if (!tenant) return null;

  return {
    user: {
      ...user,
      password_hash: user.password_hash
    },
    tenant
  };
}

/**
 * Creates and stores a password reset token record.
 * Stores only SHA-256 hash.
 */
export async function createPasswordResetToken(
  data: CreatePasswordResetTokenDTO,
  client?: pg.PoolClient | null
): Promise<PasswordResetTokenRecord> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      INSERT INTO password_reset_tokens (user_id, tenant_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, tenant_id, token_hash, is_used, expires_at, created_at, used_at;
    `;
    const res = await executor.query(query, [
      data.user_id,
      data.tenant_id,
      data.token_hash,
      data.expires_at
    ]);
    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      tenant_id: row.tenant_id,
      token_hash: row.token_hash,
      is_used: Boolean(row.is_used),
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
      used_at: row.used_at ? new Date(row.used_at) : null
    };
  }

  const record: PasswordResetTokenRecord = {
    id: `prt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    user_id: data.user_id,
    tenant_id: data.tenant_id,
    token_hash: data.token_hash,
    is_used: false,
    expires_at: data.expires_at,
    created_at: new Date(),
    used_at: null
  };
  tenantStore.passwordResetTokens.push(record);
  return record;
}

/**
 * Finds a password reset token by its SHA-256 hash.
 */
export async function findPasswordResetTokenByHash(
  tokenHash: string,
  client?: pg.PoolClient | null
): Promise<PasswordResetTokenRecord | null> {
  assertPersistenceMode();
  if (!tokenHash) return null;

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      SELECT id, user_id, tenant_id, token_hash, is_used, expires_at, created_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = $1
      LIMIT 1;
    `;
    const res = await executor.query(query, [tokenHash]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      tenant_id: row.tenant_id,
      token_hash: row.token_hash,
      is_used: Boolean(row.is_used),
      expires_at: new Date(row.expires_at),
      created_at: new Date(row.created_at),
      used_at: row.used_at ? new Date(row.used_at) : null
    };
  }

  const record = tenantStore.passwordResetTokens.find(r => r.token_hash === tokenHash);
  return record || null;
}

/**
 * Marks a password reset token as used (single-use enforcement).
 */
export async function markPasswordResetTokenUsed(
  tokenHash: string,
  client?: pg.PoolClient | null
): Promise<boolean> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      UPDATE password_reset_tokens
      SET is_used = TRUE, used_at = NOW()
      WHERE token_hash = $1 AND is_used = FALSE;
    `;
    const res = await executor.query(query, [tokenHash]);
    return (res.rowCount ?? 0) > 0;
  }

  const record = tenantStore.passwordResetTokens.find(r => r.token_hash === tokenHash);
  if (!record || record.is_used) return false;
  record.is_used = true;
  record.used_at = new Date();
  return true;
}

/**
 * Updates a user's password hash in the store/database.
 */
export async function updateUserPassword(
  userId: string,
  newPasswordHash: string,
  client?: pg.PoolClient | null
): Promise<boolean> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2;
    `;
    const res = await executor.query(query, [newPasswordHash, userId]);
    return (res.rowCount ?? 0) > 0;
  }

  const user = tenantStore.users.find(u => u.id === userId);
  if (!user) return false;
  user.password_hash = newPasswordHash;
  return true;
}

/**
 * Revokes all active refresh tokens for a user after password reset.
 */
export async function revokeAllUserRefreshTokens(
  userId: string,
  client?: pg.PoolClient | null
): Promise<number> {
  assertPersistenceMode();

  if (isPostgresConnected) {
    const executor: ClientOrPool = client || pool;
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE user_id = $1 AND is_revoked = FALSE;
    `;
    const res = await executor.query(query, [userId]);
    return res.rowCount ?? 0;
  }

  let count = 0;
  for (const record of tenantStore.refreshTokens) {
    if (record.user_id === userId && !record.is_revoked) {
      record.is_revoked = true;
      count++;
    }
  }
  return count;
}

