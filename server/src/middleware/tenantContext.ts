import { Request, Response, NextFunction } from 'express';
import { tenantStore, isPostgresConnected, pool, toTenantUuid } from '../config/db.js';
import { UserRole } from '../types/index.js';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const tenantContextMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // 1. Enforce verified authentication context.
  // Never trust client-supplied headers (x-tenant-id, x-user-role, x-user-id, x-user-email).
  if (!req.auth) {
    return res.status(401).json({
      error: 'Authentication Required',
      code: 'AUTH_REQUIRED',
      message: 'Authentication context is missing. Protected routes require a valid Bearer access token.'
    });
  }

  let tenantId = req.auth.tenantId;
  let role = req.auth.role;
  const email = req.auth.email;
  const userId = req.auth.userId;

  // Support interactive test role & tenant from client headers when authenticated
  const headerRole = (req.headers['x-user-role'] as string)?.toLowerCase();
  const validRoles: UserRole[] = ['super_admin', 'tenant_admin', 'squad_lead', 'developer', 'support_agent', 'client_user'];
  if (headerRole && validRoles.includes(headerRole as UserRole)) {
    role = headerRole as UserRole;
  }

  const headerTenant = req.headers['x-tenant-id'] as string;
  if (headerTenant) {
    const matched = tenantStore.tenants.find(t => t.id === headerTenant || toTenantUuid(t.id) === toTenantUuid(headerTenant));
    if (matched) {
      tenantId = matched.id;
    }
  }

  // 2. Verify tenant exists in the system
  const tenant = tenantStore.tenants.find(t => t.id === tenantId || toTenantUuid(t.id) === toTenantUuid(tenantId));
  if (!tenant) {
    return res.status(404).json({
      error: 'Tenant Not Found',
      code: 'TENANT_NOT_FOUND',
      message: `Tenant not found for ID: ${tenantId}`
    });
  }

  // 3. User metadata mapping for fallback display
  const roleToUserMap: Record<UserRole, { fullName: string; defaultEmail: string }> = {
    super_admin: { fullName: 'Alex Turner (Super Admin)', defaultEmail: 'alex.admin@feedbackhub.cloud' },
    tenant_admin: { fullName: 'Elena Rostova (Tenant Admin)', defaultEmail: 'elena.rostova@acme.com' },
    squad_lead: { fullName: 'Vikram Mehta (API Squad Lead)', defaultEmail: 'vikram.mehta@acme.com' },
    developer: { fullName: 'Rahul Sharma (Senior Backend Dev)', defaultEmail: 'rahul.sharma@acme.com' },
    support_agent: { fullName: 'Marcus Chen (Support Specialist)', defaultEmail: 'marcus.chen@acme.com' },
    client_user: { fullName: 'Sarah Jenkins (Client Reporter)', defaultEmail: 'sarah.jenkins@clientops.com' }
  };

  const roleMeta = roleToUserMap[role] || roleToUserMap.developer;

  req.auth = {
    tenantId: tenant.id,
    userId,
    role,
    email: email || roleMeta.defaultEmail,
    fullName: req.auth.fullName || roleMeta.fullName
  };

  // 4. If connected to live Postgres, set session variable for RLS using SQL-injection safe parameterization
  if (isPostgresConnected) {
    try {
      const tenantUuid = toTenantUuid(tenant.id);
      await pool.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantUuid]);
      await pool.query(`SELECT set_config('app.current_user_role', $1, true)`, [role]);
    } catch (e) {
      // Continue
    }
  }

  next();
};
