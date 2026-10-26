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
  // 1. In production, tenant ID comes from verified JWT or custom header
  // 2. For local dev multi-developer testing, allow override via `x-tenant-id` or default to Acme Corp
  const tenantId = (req.headers['x-tenant-id'] as string) || req.auth?.tenantId || 'tenant-acme-corp-001';
  const role = (req.headers['x-user-role'] as UserRole) || req.auth?.role || 'developer';
  const email = (req.headers['x-user-email'] as string) || req.auth?.email || 'dev.rahul@acme.com';
  const userId = (req.headers['x-user-id'] as string) || req.auth?.userId || 'user-dev-01';

  // Verify tenant exists
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  if (!tenant) {
    return res.status(404).json({ error: `Tenant not found for ID: ${tenantId}` });
  }

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
    email: (req.headers['x-user-email'] as string) || req.auth?.email || roleMeta.defaultEmail,
    fullName: roleMeta.fullName
  };

  // If connected to live Postgres, set session variable for RLS
  if (isPostgresConnected) {
    try {
      await pool.query(`SET LOCAL app.current_tenant_id = '${tenant.id}'`);
      await pool.query(`SET LOCAL app.current_user_role = '${role}'`);
    } catch (e) {
      // Continue
    }
  }

  next();
};
