import { Request, Response, NextFunction } from 'express';
import { tenantStore, isPostgresConnected, pool } from '../config/db.js';
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

  const tenantId = req.auth.tenantId;
  const role = req.auth.role;
  const email = req.auth.email;
  const userId = req.auth.userId;

  // 2. Verify tenant exists in the system
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
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
      await pool.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant.id]);
      await pool.query(`SELECT set_config('app.current_user_role', $1, true)`, [role]);
    } catch (e) {
      // Continue
    }
  }

  next();
};
