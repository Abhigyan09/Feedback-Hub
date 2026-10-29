import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { tenantStore, isPostgresConnected, pool, persistRolePermissionsToDb } from '../config/db.js';
import { requireRole, requirePermission, requireAnyPermission } from '../middleware/rbac.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { Product, User, UserRole, PermissionKey } from '../types/index.js';
import { PERMISSION_DEFINITIONS, ALL_ROLES } from '../config/permissions.js';

export const tenantRouter = Router();

// 1. GET TENANT METADATA & MONITORED PRODUCTS
tenantRouter.get('/current', (req: Request, res: Response) => {
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
tenantRouter.put('/permissions', requirePermission('permissions:edit'), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { role, permissions, updates, matrix: fullMatrix } = req.body;

  // Mode A: Full Matrix update mode (all roles)
  if (fullMatrix && typeof fullMatrix === 'object') {
    for (const r of ALL_ROLES) {
      if (fullMatrix[r] && typeof fullMatrix[r] === 'object') {
        if ((r === 'super_admin' || r === 'tenant_admin' || r === 'squad_lead') && fullMatrix[r]['permissions:edit'] === false) {
          fullMatrix[r]['permissions:edit'] = true; // prevent lockout
        }
        tenantStore.updateRolePermissions(tenantId, r as UserRole, fullMatrix[r]);
        await persistRolePermissionsToDb(tenantId, r as UserRole, fullMatrix[r]);
      }
    }
    tenantStore.saveToDisk();

    const updated = tenantStore.getPermissionsMatrix(tenantId);
    broadcastTicketEvent(tenantId, 'PERMISSIONS_UPDATED', {
      tenantId,
      matrix: updated,
      message: 'All role permissions matrix updated.'
    });

    return res.json({
      success: true,
      message: 'Role permissions matrix successfully persisted.',
      matrix: updated
    });
  }

  // Mode B: Single Role update mode
  if (role && permissions && typeof permissions === 'object') {
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }

    // Safety constraint: Prevent removing permissions:edit from super_admin, tenant_admin, or squad_lead to prevent lockout
    if ((role === 'super_admin' || role === 'tenant_admin' || role === 'squad_lead') && permissions['permissions:edit'] === false) {
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

  // Mode C: Batch updates mode
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

  res.status(400).json({ error: 'Invalid payload: provide { matrix }, { role, permissions }, or { updates }.' });
});

// 5. RESET ROLE PERMISSIONS TO PRESETS
tenantRouter.post('/permissions/reset', requirePermission('permissions:reset'), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { role } = req.body;

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

// 11. GET SQUAD STAFF MEMBERS & ACTIVE LOAD METRICS
tenantRouter.get('/staff', (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const users = tenantStore.users.filter(u => u.tenant_id === tenantId);
  const tenantTickets = tenantStore.tickets.filter(t => t.tenant_id === tenantId);

  const staffWithMetrics = users.map((u, idx) => {
    const assignedTickets = tenantTickets.filter(t => t.assigned_to === u.id);
    const openTickets = assignedTickets.filter(t => t.status !== 'RESOLVED' && t.status !== 'CLOSED');
    const resolvedTickets = assignedTickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');
    const urgentTickets = openTickets.filter(t => t.severity === 'URGENT' || t.severity === 'CRITICAL');

    return {
      id: u.id,
      tenant_id: u.tenant_id,
      email: u.email,
      name: u.full_name,
      role: u.role === 'squad_lead' ? 'Squad Lead & Arch' : u.role === 'developer' ? 'Senior Engineer' : u.role === 'tenant_admin' ? 'Tenant Administrator' : 'Support Specialist',
      raw_role: u.role,
      avatarInitials: u.full_name
        .replace(/\s*\([^)]*\)$/, '')
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'EM',
      status: u.status || (idx === 0 ? 'ON_CALL' : 'ONLINE'),
      squad: u.squad || (tenantStore.tenants.find(t => t.id === tenantId)?.default_squad || 'Core Platform Squad'),
      open_load: openTickets.length,
      resolved_load: resolvedTickets.length,
      urgent_load: urgentTickets.length,
      assigned_ticket_ids: openTickets.map(t => t.id),
      created_at: u.created_at
    };
  });

  const unassignedCount = tenantTickets.filter(
    t => (!t.assigned_to || t.assigned_to === '') && t.status !== 'RESOLVED' && t.status !== 'CLOSED'
  ).length;

  res.json({
    success: true,
    staff: staffWithMetrics,
    total_staff: staffWithMetrics.length,
    unassigned_tickets: unassignedCount
  });
});

// 12. CREATE NEW STAFF MEMBER (Admin / Lead Manager only)
tenantRouter.post('/staff', async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const isAdminOrLead = ['super_admin', 'tenant_admin', 'squad_lead'].includes(userRole);
  if (!isAdminOrLead) {
    return res.status(403).json({ error: 'Only Administrators and Lead Managers can register new staff members.' });
  }

  const { full_name, email, role = 'developer', squad, status = 'ONLINE' } = req.body;
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'Staff member full name is required.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Valid staff email address is required.' });
  }

  // Check email uniqueness within tenant
  const existing = tenantStore.users.find(u => u.tenant_id === tenantId && u.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A staff member with this email address already exists in this workspace.' });
  }

  const newId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newUser: User = {
    id: newId,
    tenant_id: tenantId,
    email: email.trim(),
    full_name: full_name.trim(),
    role: role as UserRole,
    is_active: true,
    status: status as 'ONLINE' | 'AWAY' | 'ON_CALL',
    squad: squad ? squad.trim() : (tenantStore.tenants.find(t => t.id === tenantId)?.default_squad || 'Core Engineering Squad'),
    created_at: new Date().toISOString()
  };

  tenantStore.users.push(newUser);

  if (isPostgresConnected) {
    try {
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (tenant_id, email) DO NOTHING`,
        [newUser.id, tenantId, newUser.email, 'hash_temp_pass', newUser.full_name, newUser.role, true]
      );
    } catch (dbErr) {
      console.error('[Database User Insert Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'SETTINGS_UPDATED', { tenantId, message: `New squad engineer '${newUser.full_name}' added.` });

  res.status(201).json({
    success: true,
    message: `Staff member '${newUser.full_name}' registered successfully.`,
    user: newUser
  });
});

// 13. UPDATE STAFF MEMBER
tenantRouter.patch('/staff/:id', async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const isAdminOrLead = ['super_admin', 'tenant_admin', 'squad_lead'].includes(userRole);
  if (!isAdminOrLead) {
    return res.status(403).json({ error: 'Only Administrators and Lead Managers can update staff details.' });
  }

  const { id } = req.params;
  const { full_name, email, role, squad, status } = req.body;

  const user = tenantStore.users.find(u => u.id === id && u.tenant_id === tenantId);
  if (!user) {
    return res.status(404).json({ error: 'Staff member not found.' });
  }

  if (full_name !== undefined && full_name.trim()) user.full_name = full_name.trim();
  if (email !== undefined && email.trim()) user.email = email.trim();
  if (role !== undefined) user.role = role as UserRole;
  if (squad !== undefined) user.squad = squad.trim();
  if (status !== undefined) {
    user.status = status as 'ONLINE' | 'AWAY' | 'ON_CALL';
    // If setting to ON_CALL, set other users to ONLINE
    if (status === 'ON_CALL') {
      tenantStore.users.forEach(u => {
        if (u.tenant_id === tenantId && u.id !== id && u.status === 'ON_CALL') {
          u.status = 'ONLINE';
        }
      });
    }
  }

  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE users SET full_name = $1, email = $2, role = $3, updated_at = NOW() WHERE id = $4 AND tenant_id = $5`,
        [user.full_name, user.email, user.role, id, tenantId]
      );
    } catch (dbErr) {
      console.error('[Database User Update Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'SETTINGS_UPDATED', { tenantId, message: `Staff member '${user.full_name}' updated.` });

  res.json({
    success: true,
    message: `Staff member '${user.full_name}' updated successfully.`,
    user
  });
});

// 14. DELETE STAFF MEMBER (With ticket reassignment protection)
tenantRouter.delete('/staff/:id', async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const isAdminOrLead = ['super_admin', 'tenant_admin', 'squad_lead'].includes(userRole);
  if (!isAdminOrLead) {
    return res.status(403).json({ error: 'Only Administrators and Lead Managers can remove staff members.' });
  }

  const { id } = req.params;
  const index = tenantStore.users.findIndex(u => u.id === id && u.tenant_id === tenantId);
  if (index === -1) {
    return res.status(404).json({ error: 'Staff member not found.' });
  }

  const [removedUser] = tenantStore.users.splice(index, 1);

  // Unassign all open tickets assigned to this removed member
  let unassignedCount = 0;
  tenantStore.tickets.forEach(t => {
    if (t.tenant_id === tenantId && t.assigned_to === id) {
      t.assigned_to = undefined;
      t.assigned_to_name = undefined;
      t.updated_at = new Date().toISOString();
      unassignedCount++;
    }
  });

  if (isPostgresConnected) {
    try {
      await pool.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      await pool.query(`UPDATE tickets SET assigned_to = NULL, updated_at = NOW() WHERE assigned_to = $1 AND tenant_id = $2`, [id, tenantId]);
    } catch (dbErr) {
      console.error('[Database User Delete Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'SETTINGS_UPDATED', { tenantId, message: `Staff member '${removedUser.full_name}' removed. ${unassignedCount} tickets unassigned.` });
  broadcastTicketEvent(tenantId, 'TICKETS_UPDATED', { tenantId });

  res.json({
    success: true,
    message: `Staff member '${removedUser.full_name}' removed successfully. ${unassignedCount} tickets returned to unassigned backlog.`
  });
});

// 15. AUTO-REBALANCE SQUAD WORKLOAD
tenantRouter.post('/staff/rebalance', (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const squadMembers = tenantStore.users.filter(u => u.tenant_id === tenantId && u.is_active && u.role !== 'client_user');
  if (squadMembers.length === 0) {
    return res.status(400).json({ error: 'No active engineering staff available in this workspace to balance workload.' });
  }

  const tenantTickets = tenantStore.tickets.filter(
    t => t.tenant_id === tenantId && t.status !== 'RESOLVED' && t.status !== 'CLOSED'
  );

  // Calculate current loads
  const memberLoads: Record<string, number> = {};
  squadMembers.forEach(m => {
    memberLoads[m.id] = tenantTickets.filter(t => t.assigned_to === m.id).length;
  });

  // Find unassigned tickets first
  const unassignedTickets = tenantTickets.filter(t => !t.assigned_to || t.assigned_to === '');
  let rebalancedCount = 0;

  for (const ticket of unassignedTickets) {
    // Pick member with lowest current load
    let lowestMember = squadMembers[0];
    let minLoad = memberLoads[lowestMember.id] || 0;

    for (const m of squadMembers) {
      const load = memberLoads[m.id] || 0;
      if (load < minLoad) {
        minLoad = load;
        lowestMember = m;
      }
    }

    ticket.assigned_to = lowestMember.id;
    ticket.assigned_to_name = lowestMember.full_name;
    ticket.updated_at = new Date().toISOString();
    memberLoads[lowestMember.id] = (memberLoads[lowestMember.id] || 0) + 1;
    rebalancedCount++;
  }

  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'TICKETS_UPDATED', { tenantId, message: `Workload rebalanced: ${rebalancedCount} unassigned tickets allocated.` });
  broadcastTicketEvent(tenantId, 'SETTINGS_UPDATED', { tenantId });

  res.json({
    success: true,
    message: `Workload successfully balanced across ${squadMembers.length} engineers. ${rebalancedCount} incidents assigned.`,
    rebalanced_count: rebalancedCount
  });
});

