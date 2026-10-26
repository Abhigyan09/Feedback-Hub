import { Router, Request, Response } from 'express';
import { tenantStore } from '../config/db.js';

export const tenantRouter = Router();

// GET TENANT METADATA & PRODUCTS
tenantRouter.get('/current', (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  const products = tenantStore.products.filter(p => p.tenant_id === tenantId);
  const users = tenantStore.users.filter(u => u.tenant_id === tenantId);

  res.json({
    tenant,
    products,
    team_members: users,
    active_auth: req.auth
  });
});

// LIST ALL AVAILABLE TENANTS (FOR DEMO SWITCHER IN MULTI-DEV LOCAL TESTING)
tenantRouter.get('/all', (req: Request, res: Response) => {
  res.json({
    tenants: tenantStore.tenants.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan
    }))
  });
});
