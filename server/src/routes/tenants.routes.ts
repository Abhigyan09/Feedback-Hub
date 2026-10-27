import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { tenantStore, isPostgresConnected, pool, persistRolePermissionsToDb } from '../config/db.js';
import { requireRole, requirePermission, requireAnyPermission } from '../middleware/rbac.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { Product, UserRole, PermissionKey } from '../types/index.js';
import { PERMISSION_DEFINITIONS, ALL_ROLES } from '../config/permissions.js';

export const tenantRouter = Router();

// 1. GET TENANT METADATA & MONITORED PRODUCTS
tenantRouter.get('/current', requireAnyPermission(['tenant:view_profile', 'permissions:view']), (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const tenant = tenantStore.tenants.find(t => t.id === tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found.' });
  }

  const products = tenantStore.products.filter(p => p.tenant_id === tenantId);
  const users = tenantStore.users.filter(u => u.tenant_id === tenantId);
  const permissionsMatrix = tenantStore.getPermissionsMatrix(tenantId);

  res.json({
    tenant,
    products,
    team_members: users,
    active_auth: req.auth,
    permissions_matrix: permissionsMatrix
  });
});

// 2. UPDATE ACTIVE TENANT SETTINGS
tenantRouter.put('/current', requireAnyPermission(['tenant:edit_profile', 'tenant:manage_policies', 'tenant:manage_domains']), async (req: Request, res: Response) => {
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
        `UPDATE tenants SET 
          name = $1, 
          allowed_domains = $2, 
          plan = $3, 
          webhook_url = $4, 
          notification_email = $5, 
          default_squad = $6, 
          auto_capture_telemetry = $7, 
          auto_capture_network = $8, 
          require_email = $9, 
          updated_at = NOW() 
         WHERE id = $10`,
        [
          tenant.name, 
          tenant.allowed_domains, 
          tenant.plan, 
          tenant.webhook_url, 
          tenant.notification_email, 
          tenant.default_squad, 
          tenant.auto_capture_telemetry, 
          tenant.auto_capture_network, 
          tenant.require_email, 
          tenantId
        ]
      );
    } catch (dbErr) {
      console.error('[Database Tenant Update Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

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

// 3. GET DYNAMIC ROLE PERMISSIONS MATRIX
tenantRouter.get('/permissions', (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const matrix = tenantStore.getPermissionsMatrix(tenantId);

  res.json({
    tenant_id: tenantId,
    matrix,
    definitions: PERMISSION_DEFINITIONS,
    roles: ALL_ROLES,
    current_role: req.auth!.role
  });
});

// 4. UPDATE DYNAMIC ROLE PERMISSIONS (Granular Role Customization)
tenantRouter.put('/permissions', async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const { role, permissions, updates } = req.body;

  // Authorization check: platform admins or roles granted permissions:edit
  const canEdit = userRole === 'super_admin' || 
                  userRole === 'tenant_admin' || 
                  tenantStore.hasPermission(tenantId, userRole, 'permissions:edit');

  if (!canEdit) {
    return res.status(403).json({
      error: 'Permission Denied',
      message: `Your current role '${userRole}' is not granted 'permissions:edit' to customize the RBAC matrix.`
    });
  }

  // Single Role update mode
  if (role && permissions && typeof permissions === 'object') {
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }

    // Safety constraint: Prevent removing permissions:edit from super_admin to prevent irreversible lockout
    if (role === 'super_admin' && permissions['permissions:edit'] === false) {
      permissions['permissions:edit'] = true;
    }

    const updatedMatrix = tenantStore.updateRolePermissions(tenantId, role as UserRole, permissions);
    await persistRolePermissionsToDb(tenantId, role as UserRole, updatedMatrix[role as UserRole]);
    tenantStore.saveToDisk();

    // Broadcast permissions change real-time
    broadcastTicketEvent(tenantId, 'PERMISSIONS_UPDATED', {
      tenantId,
      role,
      matrix: updatedMatrix,
      message: `Permissions updated for role '${role}'.`
    });

    return res.json({
      success: true,
      message: `Permissions for role '${role}' updated and saved successfully.`,
      matrix: updatedMatrix
    });
  }

  // Batch updates mode
  if (Array.isArray(updates)) {
    for (const item of updates) {
      const { role: itemRole, permissionKey, isGranted } = item;
      if (ALL_ROLES.includes(itemRole)) {
        if (itemRole === 'super_admin' && permissionKey === 'permissions:edit' && !isGranted) {
          continue; // lockout protection
        }
        tenantStore.updateRolePermissions(tenantId, itemRole as UserRole, {
          [permissionKey]: Boolean(isGranted)
        } as Partial<Record<PermissionKey, boolean>>);
      }
    }

    const matrix = tenantStore.getPermissionsMatrix(tenantId);
    for (const r of ALL_ROLES) {
      await persistRolePermissionsToDb(tenantId, r, matrix[r]);
    }
    tenantStore.saveToDisk();

    broadcastTicketEvent(tenantId, 'PERMISSIONS_UPDATED', {
      tenantId,
      matrix,
      message: 'Batch role permissions matrix updated.'
    });

    return res.json({
      success: true,
      message: 'Batch role permissions matrix successfully persisted.',
      matrix
    });
  }

  res.status(400).json({ error: 'Invalid payload: provide { role, permissions } or { updates }.' });
});

// 5. RESET ROLE PERMISSIONS TO PRESETS
tenantRouter.post('/permissions/reset', async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const { role } = req.body;

  const canReset = userRole === 'super_admin' || 
                   userRole === 'tenant_admin' || 
                   tenantStore.hasPermission(tenantId, userRole, 'permissions:reset');

  if (!canReset) {
    return res.status(403).json({
      error: 'Permission Denied',
      message: `Your current role '${userRole}' is not granted 'permissions:reset' to restore RBAC presets.`
    });
  }

  const targetRole = role && ALL_ROLES.includes(role) ? (role as UserRole) : undefined;
  const resetMatrix = tenantStore.resetRolePermissions(tenantId, targetRole);

  if (targetRole) {
    await persistRolePermissionsToDb(tenantId, targetRole, resetMatrix[targetRole]);
  } else {
    for (const r of ALL_ROLES) {
      await persistRolePermissionsToDb(tenantId, r, resetMatrix[r]);
    }
  }
  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'PERMISSIONS_UPDATED', {
    tenantId,
    targetRole: targetRole || 'ALL',
    matrix: resetMatrix,
    message: targetRole 
      ? `Role '${targetRole}' reset to bank-grade baseline defaults.`
      : 'All tenant roles reset to bank-grade baseline defaults.'
  });

  res.json({
    success: true,
    message: targetRole 
      ? `Role '${targetRole}' reset to baseline defaults.` 
      : 'All role permissions reset to bank-grade baseline defaults.',
    matrix: resetMatrix
  });
});

// 6. CREATE NEW MONITORED PRODUCT & GENERATE API KEY
tenantRouter.post('/products', requirePermission('products:create'), async (req: Request, res: Response) => {
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
        `INSERT INTO products (id, tenant_id, name, slug, description, api_key_hash, raw_api_key, environment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [newProduct.id, tenantId, newProduct.name, newProduct.slug, newProduct.description, newProduct.api_key_hash, newProduct.raw_api_key, newProduct.environment]
      );
    } catch (dbErr) {
      console.error('[Database Product Insert Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  res.status(201).json({
    success: true,
    message: `Monitored product '${newProduct.name}' added successfully.`,
    product: newProduct
  });
});

// 7. UPDATE OR ROTATE PRODUCT API KEY
tenantRouter.put('/products/:id', requireAnyPermission(['products:edit', 'products:rotate_keys']), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const role = req.auth!.role;
  const { id } = req.params;
  const { name, environment, description, rotate_key } = req.body;

  const product = tenantStore.products.find(p => p.id === id && p.tenant_id === tenantId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found in this tenant scope.' });
  }

  // Key rotation requires specific permission
  if (rotate_key) {
    if (!tenantStore.hasPermission(tenantId, role, 'products:rotate_keys')) {
      return res.status(403).json({
        error: 'Permission Denied',
        message: `Your current role '${role}' is not granted 'products:rotate_keys' to rotate API keys.`
      });
    }
    const rawApiKey = `fb_live_${product.slug}_${crypto.randomBytes(8).toString('hex')}`;
    product.raw_api_key = rawApiKey;
    product.api_key_hash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
  }

  if (name !== undefined) product.name = name.trim();
  if (environment !== undefined) product.environment = environment;
  if (description !== undefined) product.description = description.trim();
  product.updated_at = new Date().toISOString();

  // If live Postgres
  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE products SET name = $1, environment = $2, api_key_hash = $3, raw_api_key = $4, description = $5, updated_at = NOW() WHERE id = $6 AND tenant_id = $7`,
        [product.name, product.environment, product.api_key_hash, product.raw_api_key, product.description, id, tenantId]
      );
    } catch (dbErr) {
      console.error('[Database Product Update Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  res.json({
    success: true,
    message: rotate_key ? 'Product API key rotated successfully.' : 'Product updated successfully.',
    product
  });
});

// 8. DIAGNOSTIC TEST PING FOR SDK INGESTION
tenantRouter.get('/ping-ingest', requirePermission('audit:test_bridge'), (req: Request, res: Response) => {
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

// 9. DELETE MONITORED PRODUCT
tenantRouter.delete('/products/:id', requirePermission('products:delete'), async (req: Request, res: Response) => {
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

  tenantStore.saveToDisk();

  res.json({
    success: true,
    message: `Product '${deletedProduct.name}' removed successfully.`
  });
});

// 10. LIST ALL TENANTS (FOR SWITCHER)
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
