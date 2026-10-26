import { Router, Request, Response } from 'express';
import { tenantStore } from '../config/db.js';
import { requireRole } from '../middleware/rbac.js';

export const tenantRouter = Router();

// 1. GET TENANT METADATA & PRODUCTS FOR CURRENT TENANT
tenantRouter.get('/current', (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  if (!tenant) {
    return res.status(404).json({ error: `Tenant not found for ID: ${tenantId}` });
  }

  const products = tenantStore.products.filter(p => p.tenant_id === tenantId);
  // Sanitize password_hash from team members
  const users = tenantStore.users
    .filter(u => u.tenant_id === tenantId)
    .map(({ password_hash, ...safeUser }) => safeUser);

  res.json({
    tenant,
    products,
    team_members: users,
    active_auth: req.auth
  });
});

// 2. UPDATE CURRENT TENANT SETTINGS (Restricted to Tenant Admins & Super Admins)
tenantRouter.patch('/current', requireRole(['super_admin', 'tenant_admin']), (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  if (!tenant) {
    return res.status(404).json({ error: `Tenant not found for ID: ${tenantId}` });
  }

  const { name, plan, allowed_domains } = req.body;
  if (name && typeof name === 'string') tenant.name = name;
  if (plan && typeof plan === 'string') tenant.plan = plan;
  if (allowed_domains && Array.isArray(allowed_domains)) tenant.allowed_domains = allowed_domains;

  res.json({
    message: 'Tenant settings updated successfully',
    tenant
  });
});

// 3. LIST ALL AVAILABLE TENANTS (SUPER_ADMIN ONLY - Prevents unauthorized tenant enumeration)
tenantRouter.get('/all', requireRole(['super_admin']), (req: Request, res: Response) => {
  res.json({
    tenants: tenantStore.tenants.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan
    }))
  });
});

