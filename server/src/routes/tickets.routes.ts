import { Router, Request, Response } from 'express';
import { tenantStore, isPostgresConnected, pool } from '../config/db.js';
import { requirePermission } from '../middleware/rbac.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { decryptSensitiveData } from '../services/crypto.js';
import { Ticket, TicketEvent } from '../types/index.js';

export const ticketRouter = Router();

// 1. GET ALL TICKETS FOR CURRENT TENANT
ticketRouter.get('/', requirePermission('tickets:view'), (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  // STRICT MULTI-TENANT FILTER
  let tickets = tenantStore.tickets.filter(t => t.tenant_id === tenantId);

  // Dynamic Granular Permission Check for Telemetry
  const canViewInternalTelemetry = tenantStore.hasPermission(tenantId, userRole, 'tickets:view_telemetry_internal');

  if (!canViewInternalTelemetry) {
    if (userRole === 'support_agent') {
      tickets = tickets.map(t => ({
        ...t,
        telemetry: t.telemetry ? {
          page_url: t.telemetry.page_url,
          app_version: t.telemetry.app_version,
          viewport_dimensions: t.telemetry.viewport_dimensions,
          network_errors: t.telemetry.network_errors,
          screenshot_url: t.telemetry.screenshot_url
        } : undefined
      }));
    } else {
      // General non-telemetry role (client or restricted)
      tickets = tickets.map(t => ({
        ...t,
        telemetry: t.telemetry ? {
          page_url: t.telemetry.page_url,
          app_version: t.telemetry.app_version,
          viewport_dimensions: t.telemetry.viewport_dimensions,
          screenshot_url: t.telemetry.screenshot_url
        } : undefined
      }));
    }
  }

  res.json({
    tenant_id: tenantId,
    user_role: userRole,
    count: tickets.length,
    tickets
  });
});

// CLEAR ALL TICKETS FOR CURRENT TENANT
ticketRouter.delete('/clear', requirePermission('tickets:delete'), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  tenantStore.tickets = tenantStore.tickets.filter(t => t.tenant_id !== tenantId);
  tenantStore.events = tenantStore.events.filter(e => e.tenant_id !== tenantId);

  // If live Postgres is connected, purge from DB
  if (isPostgresConnected) {
    try {
      await pool.query('DELETE FROM tickets WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM ticket_events WHERE tenant_id = $1', [tenantId]);
    } catch (err) {
      console.error('[Database Clear Error]', err);
    }
  }

  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket: null as any, event: null as any });

  res.json({ success: true, message: 'All tickets cleared successfully for current tenant.' });
});

// QUICK-SEED 3 DYNAMIC LIVE INCIDENTS
ticketRouter.post('/seed-demo', requirePermission('tickets:create'), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const now = Date.now();
  
  const sampleData: Ticket[] = [
    {
      id: `ticket-${now}-1`,
      tenant_id: tenantId,
      product_id: 'prod-checkout-gateway',
      product_name: 'Checkout Gateway API & SDK',
      short_code: 'FH-501',
      title: 'OAuth2 token exchange timing out on iOS Safari WebViews',
      description: 'Clients on iOS 17.4 experiencing 504 gateway timeout when trading auth code for JWT session token.',
      category: 'API_FAILURE',
      severity: 'CRITICAL',
      status: 'IN_DEV',
      reporter_email: 'lead-dev@client-payment.com',
      assigned_squad: 'PAYMENT_CORE_API',
      assigned_to: 'member-2',
      assigned_to_name: 'Marcus Chen',
      sla_due_at: new Date(now + 45 * 60000).toISOString(),
      created_at: new Date(now - 14 * 60000).toISOString(),
      updated_at: new Date(now - 5 * 60000).toISOString(),
      telemetry: {
        page_url: 'https://checkout.acme.com/v2/pay/upi/intent?session=sess_982b',
        app_version: 'v2.14.0-prod',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        viewport_dimensions: '390x844',
        console_logs: [
          { type: 'info', message: 'Initialized OAuth SDK v2.4.1', timestamp: new Date(now - 14 * 60000).toLocaleTimeString() },
          { type: 'error', message: 'GatewayTimeoutError: Upstream auth cluster took > 10000ms', timestamp: new Date(now - 13 * 60000).toLocaleTimeString() }
        ],
        network_errors: [
          { url: 'POST /api/v1/auth/token/exchange', status: 504, method: 'POST', timestamp: new Date(now - 13 * 60000).toLocaleTimeString() }
        ]
      }
    },
    {
      id: `ticket-${now}-2`,
      tenant_id: tenantId,
      product_id: 'prod-checkout-gateway',
      product_name: 'Checkout Gateway API & SDK',
      short_code: 'FH-502',
      title: 'PostgreSQL connection pool exhaustion during batch telemetry ingest',
      description: 'RDS Proxy spikes to 100% pool utilization under spike loads, queuing incoming crash telemetry.',
      category: 'PERFORMANCE',
      severity: 'CRITICAL',
      status: 'OPEN',
      reporter_email: 'alerts@internal-ops.io',
      assigned_squad: 'INFRASTRUCTURE_CORE',
      assigned_to: undefined,
      assigned_to_name: undefined,
      sla_due_at: new Date(now - 15 * 60000).toISOString(),
      created_at: new Date(now - 48 * 60000).toISOString(),
      updated_at: new Date(now - 10 * 60000).toISOString(),
      telemetry: {
        page_url: 'POST /api/v1/ingest/telemetry/bulk',
        app_version: 'v2.14.0',
        console_logs: [
          { type: 'error', message: 'remaining connection slots reserved for superuser', timestamp: new Date(now - 35 * 60000).toLocaleTimeString() }
        ],
        network_errors: [
          { url: 'POST /api/v1/ingest/telemetry/bulk', status: 503, timestamp: new Date(now - 35 * 60000).toLocaleTimeString() }
        ]
      }
    },
    {
      id: `ticket-${now}-3`,
      tenant_id: tenantId,
      product_id: 'prod-dashboard',
      product_name: 'Merchant Admin Portal',
      short_code: 'FH-503',
      title: 'Client feedback widget overflow on mobile screens < 360px width',
      description: 'Modal horizontal container causes layout shift on small Android devices. Awaiting client reproduction video and viewport logs.',
      category: 'UI_GLITCH',
      severity: 'MEDIUM',
      status: 'TRIAGED',
      reporter_email: 'sarah.jenkins@feedbackhub.io',
      assigned_squad: 'FRONTEND_PORTAL',
      assigned_to: 'member-3',
      assigned_to_name: 'Sarah Jenkins',
      waiting_for_client: true,
      sla_due_at: new Date(now + 180 * 60000).toISOString(),
      created_at: new Date(now - 75 * 60000).toISOString(),
      updated_at: new Date(now - 20 * 60000).toISOString()
    }
  ];

  sampleData.forEach(t => tenantStore.tickets.unshift(t));
  tenantStore.saveToDisk();

  sampleData.forEach(t => broadcastTicketEvent(tenantId, 'NEW_TICKET_ALERT', { ticket: t, message: `Dynamic Incident ${t.short_code} seeded.` }));

  res.status(201).json({
    message: '3 dynamic live incidents created',
    tickets: sampleData
  });
});

// 2. GET SINGLE TICKET WITH FULL TELEMETRY & EVENT STREAM
ticketRouter.get('/:id', requirePermission('tickets:view'), (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found in this tenant scope.' });
  }

  // Fetch events for this ticket
  let events = tenantStore.events.filter(e => e.ticket_id === id && e.tenant_id === tenantId);

  // Dynamic Permission: Only roles granted 'tickets:view_internal_notes' can see internal quarantine notes
  const canViewInternalNotes = tenantStore.hasPermission(tenantId, userRole, 'tickets:view_internal_notes');
  if (!canViewInternalNotes) {
    events = events.filter(e => !e.is_internal_only);
  }

  // Dynamic Permission for Telemetry Inspection & Decryption
  const canViewInternalTelemetry = tenantStore.hasPermission(tenantId, userRole, 'tickets:view_telemetry_internal');
  let sanitizedTelemetry = ticket.telemetry ? { ...ticket.telemetry } : undefined;

  if (sanitizedTelemetry) {
    if (!canViewInternalTelemetry) {
      if (userRole === 'support_agent') {
        // Support sees network status, but no decrypted AES sensitive payloads or raw browser consoles
        delete sanitizedTelemetry.console_logs;
        delete sanitizedTelemetry.encrypted_sensitive_data;
      } else {
        // Redact all sensitive fields
        delete sanitizedTelemetry.console_logs;
        delete sanitizedTelemetry.network_errors;
        delete sanitizedTelemetry.encrypted_sensitive_data;
      }
    } else {
      // Authorized engineering role: Decrypt AES-256 payload
      if (sanitizedTelemetry.encrypted_sensitive_data) {
        sanitizedTelemetry.encrypted_sensitive_data = decryptSensitiveData(sanitizedTelemetry.encrypted_sensitive_data);
      }
    }
  }

  res.json({
    ticket: {
      ...ticket,
      telemetry: sanitizedTelemetry
    },
    events
  });
});

// 3. UPDATE TICKET STATUS
ticketRouter.patch('/:id/status', requirePermission('tickets:change_status'), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, note } = req.body;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  // Support Agent safety guard
  if (userRole === 'support_agent' && status !== 'TRIAGED' && status !== 'OPEN') {
    return res.status(403).json({
      error: 'Permission Denied',
      message: 'Support agents are authorized for triage (TRIAGED or OPEN). Advancing to IN_DEV or RESOLVED requires an engineering or lead role.'
    });
  }

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  const oldStatus = ticket.status;
  ticket.status = status;
  ticket.updated_at = new Date().toISOString();

  // Create timeline event
  const event: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket.id,
    tenant_id: tenantId,
    author_name: req.auth!.fullName,
    author_role: req.auth!.role,
    event_type: 'STATUS_CHANGE',
    content: note || `Status changed from ${oldStatus} to ${status}.`,
    is_internal_only: false,
    created_at: new Date().toISOString()
  };
  tenantStore.events.push(event);
  tenantStore.saveToDisk();

  // Real-time broadcast
  broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket, event });

  res.json({
    message: 'Status updated successfully',
    ticket,
    event
  });
});

// 4. ADD TIMELINE EVENT / DEV NOTE
ticketRouter.post('/:id/events', requirePermission('tickets:view'), (req: Request, res: Response) => {
  const { id } = req.params;
  const { content, is_internal_only } = req.body;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // Dynamic Permission: Posting internal notes requires 'tickets:create_internal_notes'
  let internalFlag = Boolean(is_internal_only);
  if (internalFlag && !tenantStore.hasPermission(tenantId, userRole, 'tickets:create_internal_notes')) {
    internalFlag = false; // Fallback to public client reply if not permitted to post internal quarantined notes
  }

  const event: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket.id,
    tenant_id: tenantId,
    author_name: req.auth!.fullName,
    author_role: userRole,
    event_type: internalFlag ? 'DEV_NOTE' : 'CLIENT_REPLY',
    content,
    is_internal_only: internalFlag,
    created_at: new Date().toISOString()
  };

  tenantStore.events.push(event);
  tenantStore.saveToDisk();

  // Real-time broadcast respecting quarantine
  broadcastTicketEvent(tenantId, 'NEW_EVENT', { ticketId: id, event }, internalFlag);

  res.status(201).json({
    message: 'Event recorded successfully',
    event
  });
});

// 5. EDIT & UPDATE TICKET
ticketRouter.put('/:id', requirePermission('tickets:edit'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const { 
    title, 
    description, 
    category, 
    severity, 
    status, 
    assigned_squad, 
    assigned_to, 
    assigned_to_name,
    rating 
  } = req.body;

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found in this tenant scope.' });
  }

  // Check assignment permission if assignee is changing
  if ((assigned_to !== undefined || assigned_squad !== undefined) && 
      (assigned_to !== ticket.assigned_to || assigned_squad !== ticket.assigned_squad)) {
    if (!tenantStore.hasPermission(tenantId, userRole, 'tickets:assign')) {
      return res.status(403).json({
        error: 'Permission Denied',
        message: `Your current role '${userRole}' is not granted 'tickets:assign' to reassign squads or developers.`
      });
    }
  }

  const oldTitle = ticket.title;
  const oldStatus = ticket.status;
  const oldSeverity = ticket.severity;
  const oldAssignedTo = ticket.assigned_to;
  const oldAssignedToName = ticket.assigned_to_name;

  // Apply updates dynamically
  if (title !== undefined) ticket.title = title;
  if (description !== undefined) ticket.description = description;
  if (category !== undefined) ticket.category = category;
  if (severity !== undefined) ticket.severity = severity;
  if (status !== undefined) {
    ticket.status = status;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      ticket.sla_due_at = ticket.sla_due_at; // Keep original SLA
    }
  }
  if (assigned_squad !== undefined) ticket.assigned_squad = assigned_squad;
  if (assigned_to !== undefined) ticket.assigned_to = assigned_to;
  if (assigned_to_name !== undefined) ticket.assigned_to_name = assigned_to_name;
  if (rating !== undefined) ticket.rating = Number(rating);
  ticket.updated_at = new Date().toISOString();

  // If live Postgres is connected, update DB
  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE tickets SET title = $1, description = $2, category = $3, severity = $4, status = $5, assigned_squad = $6, assigned_to_name = $7, rating = $8, updated_at = NOW() WHERE id = $9 AND tenant_id = $10`,
        [ticket.title, ticket.description, ticket.category, ticket.severity, ticket.status, ticket.assigned_squad, ticket.assigned_to_name || null, ticket.rating !== undefined ? ticket.rating : null, id, tenantId]
      );
    } catch (dbErr) {
      console.error('[Database Update Error]', dbErr);
    }
  }

  // Determine event type and content (Specialized for assignment vs general update)
  let eventType: 'STATUS_CHANGE' | 'ASSIGNED' = 'STATUS_CHANGE';
  let eventContent = `Ticket updated by ${req.auth!.fullName}. Status: ${oldStatus} -> ${ticket.status}, Severity: ${oldSeverity} -> ${ticket.severity}.`;

  if (assigned_to !== undefined && assigned_to !== oldAssignedTo) {
    eventType = 'ASSIGNED';
    eventContent = ticket.assigned_to_name 
      ? `Ticket assigned to developer ${ticket.assigned_to_name} by ${req.auth!.fullName}.` 
      : `Ticket unassigned by ${req.auth!.fullName}.`;
  }

  // Record audit timeline event
  const updateEvent: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket.id,
    tenant_id: tenantId,
    author_name: req.auth!.fullName,
    author_role: req.auth!.role,
    event_type: eventType,
    content: eventContent,
    is_internal_only: false,
    created_at: new Date().toISOString()
  };
  tenantStore.events.push(updateEvent);
  tenantStore.saveToDisk();

  // Broadcast real-time update
  broadcastTicketEvent(tenantId, 'TICKET_UPDATED', {
    ticket,
    event: updateEvent,
    message: `[UPDATED] ${ticket.short_code}: ${ticket.title}`
  });

  res.json({
    success: true,
    message: 'Ticket updated successfully',
    ticket
  });
});

// 6. UPDATE TICKET ASSIGNEE
ticketRouter.patch('/:id/assignee', requirePermission('tickets:assign'), (req: Request, res: Response) => {
  const { id } = req.params;
  const { assigneeId, assigneeName } = req.body;
  const tenantId = req.auth!.tenantId;

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  ticket.assigned_to = assigneeId || undefined;
  ticket.assigned_to_name = assigneeName || undefined;
  ticket.updated_at = new Date().toISOString();

  // Create timeline event
  const event: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket.id,
    tenant_id: tenantId,
    author_name: req.auth!.fullName,
    author_role: req.auth!.role,
    event_type: 'ASSIGNED',
    content: assigneeName ? `Reassigned to ${assigneeName}.` : 'Ticket marked as Unassigned.',
    is_internal_only: false,
    created_at: new Date().toISOString()
  };
  tenantStore.events.push(event);
  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket, event });

  res.json({
    message: 'Assignee updated successfully',
    ticket,
    event
  });
});

// 7. CREATE NEW INCIDENT TICKET DYNAMICALLY
ticketRouter.post('/', requirePermission('tickets:create'), (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const { title, description, category, severity, priority, assigned_to, assigned_to_name, reporter_email, telemetry } = req.body;

  const ticketCount = tenantStore.tickets.filter(t => t.tenant_id === tenantId).length + 1;
  const shortCode = `FH-${400 + ticketCount}`;

  const newTicket: Ticket = {
    id: `ticket-${Date.now()}`,
    tenant_id: tenantId,
    product_id: 'prod-core-api',
    product_name: 'Core Platform & Telemetry',
    short_code: shortCode,
    title: title || 'New Telemetry Incident',
    description: description || 'Ingested dynamically via Feedback-Hub API.',
    category: category || 'BUG',
    severity: severity || priority || 'MEDIUM',
    status: 'OPEN',
    reporter_email: reporter_email || req.auth!.email || 'oncall@feedbackhub.io',
    assigned_squad: 'CORE_ENGINEERING_SQUAD',
    assigned_to: assigned_to || undefined,
    assigned_to_name: assigned_to_name || undefined,
    sla_due_at: new Date(Date.now() + 120 * 60000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    waiting_for_client: Boolean(req.body.waiting_for_client),
    telemetry: telemetry || {
      page_url: 'https://app.feedbackhub.io/incidents/create',
      app_version: 'v2.1.0-live',
      console_logs: [],
      network_errors: []
    }
  };

  tenantStore.tickets.unshift(newTicket);
  tenantStore.saveToDisk();

  broadcastTicketEvent(tenantId, 'NEW_TICKET_ALERT', {
    ticket: newTicket,
    message: `[ALERT] New ${newTicket.severity} incident created: ${newTicket.short_code} - ${newTicket.title}`
  });

  res.status(201).json({
    message: 'Ticket created successfully',
    ticket: newTicket
  });
});

// 8. DELETE TICKET
ticketRouter.delete('/:id', requirePermission('tickets:delete'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.auth!.tenantId;

  const ticketIndex = tenantStore.tickets.findIndex(t => t.id === id && t.tenant_id === tenantId);
  if (ticketIndex === -1) {
    return res.status(404).json({ error: 'Ticket not found in this tenant scope.' });
  }

  const [deletedTicket] = tenantStore.tickets.splice(ticketIndex, 1);

  // Cascade delete associated events in memory
  tenantStore.events = tenantStore.events.filter(e => e.ticket_id !== id);

  // If live Postgres is connected, delete from DB
  if (isPostgresConnected) {
    try {
      await pool.query(
        `DELETE FROM tickets WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
    } catch (dbErr) {
      console.error('[Database Delete Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  // Broadcast real-time deletion
  broadcastTicketEvent(tenantId, 'TICKET_DELETED', {
    ticketId: id,
    shortCode: deletedTicket.short_code,
    message: `[DELETED] Ticket ${deletedTicket.short_code} was removed.`
  });

  res.json({
    success: true,
    message: `Ticket ${deletedTicket.short_code} permanently deleted.`,
    ticket_id: id
  });
});
