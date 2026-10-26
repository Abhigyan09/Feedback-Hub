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

  // 3. Preserve typed context strictly from verified auth
  req.auth = {
    tenantId: tenant.id,
    userId,
    role,
    email,
    fullName: req.auth.fullName || (role === 'squad_lead' ? 'Vikram Mehta (Lead)' : role === 'developer' ? 'Rahul Sharma (Dev)' : 'Sarah Jenkins (Client)')
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
