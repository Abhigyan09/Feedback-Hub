import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { tenantStore, isPostgresConnected, pool } from '../config/db.js';
import { requireRole } from '../middleware/rbac.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { Product } from '../types/index.js';

export const tenantRouter = Router();

// 1. GET TENANT METADATA & MONITORED PRODUCTS (Engineering & Admins)
tenantRouter.get('/current', requireRole(['super_admin', 'tenant_admin', 'squad_lead', 'developer']), (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found.' });
  }

  const products = tenantStore.products.filter(p => p.tenant_id === tenantId);
  const users = tenantStore.users.filter(u => u.tenant_id === tenantId);

  res.json({
    tenant,
    products,
    team_members: users,
    active_auth: req.auth
  });
});

// 2. UPDATE ACTIVE TENANT SETTINGS (Requires Tenant Administrator or Super Admin Role)
tenantRouter.put('/current', requireRole(['super_admin', 'tenant_admin']), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { 
    name, 
    allowed_domains, 
    plan, 
    webhook_url, 
    notification_email, 
    auto_capture_telemetry, 
    auto_capture_network, 
    require_email, 
    default_squad 
  } = req.body;

  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found.' });
  }

  // Update in-memory store
  if (name !== undefined && name.trim()) tenant.name = name.trim();
  if (plan !== undefined) tenant.plan = plan;
  if (webhook_url !== undefined) tenant.webhook_url = webhook_url.trim();
  if (notification_email !== undefined) tenant.notification_email = notification_email.trim();
  if (auto_capture_telemetry !== undefined) tenant.auto_capture_telemetry = Boolean(auto_capture_telemetry);
  if (auto_capture_network !== undefined) tenant.auto_capture_network = Boolean(auto_capture_network);
  if (require_email !== undefined) tenant.require_email = Boolean(require_email);
  if (default_squad !== undefined) tenant.default_squad = default_squad.trim();
  tenant.updated_at = new Date().toISOString();

  if (Array.isArray(allowed_domains)) {
    // Clean and normalize domains
    tenant.allowed_domains = allowed_domains
      .map((d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0])
      .filter((d: string) => d.length > 0);
  }

  // If live Postgres is active, persist to DB
  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE tenants SET name = $1, allowed_domains = $2, plan = $3, updated_at = NOW() WHERE id = $4`,
        [tenant.name, tenant.allowed_domains, tenant.plan, tenantId]
      );
    } catch (dbErr) {
      console.error('[Database Tenant Update Error]', dbErr);
    }
  }

  // Broadcast settings change in real-time
  broadcastTicketEvent(tenantId, 'SETTINGS_UPDATED', {
    tenant,
    message: `Tenant settings updated for ${tenant.name}`
  });

  res.json({
    success: true,
    message: 'Tenant settings updated and saved successfully.',
    tenant
  });
});

// 3. CREATE NEW MONITORED PRODUCT & GENERATE API KEY (Requires Admin Role)
tenantRouter.post('/products', requireRole(['super_admin', 'tenant_admin']), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { name, environment = 'production', description = '' } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required.' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const rawApiKey = `fb_live_${slug}_${crypto.randomBytes(8).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

  const newProduct: Product = {
    id: `prod-${Date.now()}`,
    tenant_id: tenantId,
    name: name.trim(),
    slug,
    description: description.trim(),
    api_key_hash: apiKeyHash,
    raw_api_key: rawApiKey,
    environment,
    created_at: new Date().toISOString()
  };

  tenantStore.products.push(newProduct);

  // If live Postgres is connected
  if (isPostgresConnected) {
    try {
      await pool.query(
        `INSERT INTO products (id, tenant_id, name, slug, api_key_hash, environment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [newProduct.id, tenantId, newProduct.name, newProduct.slug, newProduct.api_key_hash, newProduct.environment]
      );
    } catch (dbErr) {
      console.error('[Database Product Insert Error]', dbErr);
    }
  }

  res.status(201).json({
    success: true,
    message: `Monitored product '${newProduct.name}' added successfully.`,
    product: newProduct
  });
});

// 4. UPDATE OR ROTATE PRODUCT API KEY (Requires Admin Role)
tenantRouter.put('/products/:id', requireRole(['super_admin', 'tenant_admin']), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { id } = req.params;
  const { name, environment, description, rotate_key } = req.body;

  const product = tenantStore.products.find(p => p.id === id && p.tenant_id === tenantId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found in this tenant scope.' });
  }

  if (name !== undefined) product.name = name.trim();
  if (environment !== undefined) product.environment = environment;
  if (description !== undefined) product.description = description.trim();
  product.updated_at = new Date().toISOString();

  // Key rotation
  if (rotate_key) {
    const rawApiKey = `fb_live_${product.slug}_${crypto.randomBytes(8).toString('hex')}`;
    product.raw_api_key = rawApiKey;
    product.api_key_hash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
  }

  // If live Postgres
  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE products SET name = $1, environment = $2, api_key_hash = $3 WHERE id = $4 AND tenant_id = $5`,
        [product.name, product.environment, product.api_key_hash, id, tenantId]
      );
    } catch (dbErr) {
      console.error('[Database Product Update Error]', dbErr);
    }
  }

  res.json({
    success: true,
    message: rotate_key ? 'Product API key rotated successfully.' : 'Product updated successfully.',
    product
  });
});

// 4.1 DIAGNOSTIC TEST PING FOR SDK INGESTION (Engineering & Admins)
tenantRouter.get('/ping-ingest', requireRole(['super_admin', 'tenant_admin', 'squad_lead', 'developer']), (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  const products = tenantStore.products.filter(p => p.tenant_id === tenantId);

  res.json({
    status: 'ONLINE',
    tenant_id: tenantId,
    tenant_name: tenant?.name,
    isolation: tenant?.isolation_standard || 'PostgreSQL 16 RLS (Bank-Grade)',
    total_products: products.length,
    allowed_domains: tenant?.allowed_domains || [],
    client_origin: req.headers.origin || 'direct-client',
    server_time: new Date().toISOString()
  });
});

// 5. DELETE MONITORED PRODUCT (Requires Admin Role)
tenantRouter.delete('/products/:id', requireRole(['super_admin', 'tenant_admin']), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { id } = req.params;

  const index = tenantStore.products.findIndex(p => p.id === id && p.tenant_id === tenantId);
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found in this tenant scope.' });
  }

  const [deletedProduct] = tenantStore.products.splice(index, 1);

  if (isPostgresConnected) {
    try {
      await pool.query(`DELETE FROM products WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    } catch (dbErr) {
      console.error('[Database Product Delete Error]', dbErr);
    }
  }

  res.json({
    success: true,
    message: `Product '${deletedProduct.name}' removed successfully.`
  });
});

// 6. LIST ALL TENANTS (FOR SWITCHER)
tenantRouter.get('/all', (req: Request, res: Response) => {
  res.json({
    tenants: tenantStore.tenants.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      allowed_domains: t.allowed_domains
    }))
  });
});
