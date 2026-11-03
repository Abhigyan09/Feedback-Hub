import { Router, Request, Response } from 'express';
import { tenantStore, isPostgresConnected, pool, toTenantUuid, toTenantTextId } from '../config/db.js';
import { requirePermission } from '../middleware/rbac.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { decryptSensitiveData } from '../services/crypto.js';
import { Ticket, TicketEvent, TicketStatus } from '../types/index.js';

export const ticketRouter = Router();

// Helper to normalize input ticket status into strict PostgreSQL enum values
export function normalizeDbStatus(rawStatus: string): TicketStatus {
  const s = (rawStatus || '').toUpperCase().trim().replace(/[\s-]+/g, '_');
  if (s === 'IN_PROGRESS' || s === 'IN_DEV' || s === 'DEV' || s === 'DEVELOPMENT') return 'IN_DEV';
  if (s === 'IN_QA' || s === 'QA' || s === 'TESTING') return 'IN_QA';
  if (s === 'TRIAGED' || s === 'TRIAGE') return 'TRIAGED';
  if (s === 'RESOLVED' || s === 'DONE') return 'RESOLVED';
  if (s === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}

// Helper to sanitize telemetry based on RBAC permissions
function sanitizeTelemetry(
  telemetry: any,
  canViewInternalTelemetry: boolean,
  userRole: string,
  decryptSensitive = false
) {
  if (!telemetry) return undefined;
  const sanitized = { ...telemetry };

  if (!canViewInternalTelemetry) {
    if (userRole === 'support_agent') {
      delete sanitized.console_logs;
      delete sanitized.encrypted_sensitive_data;
    } else {
      delete sanitized.console_logs;
      delete sanitized.network_errors;
      delete sanitized.encrypted_sensitive_data;
    }
  } else if (decryptSensitive && sanitized.encrypted_sensitive_data) {
    sanitized.encrypted_sensitive_data = decryptSensitiveData(sanitized.encrypted_sensitive_data);
  }
  return sanitized;
}

// 1. GET ALL TICKETS FOR CURRENT TENANT (LIVE FROM SUPABASE)
ticketRouter.get('/', requirePermission('tickets:view'), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const targetTenantUuid = toTenantUuid(tenantId);

  let tickets: Ticket[] = [];

  if (isPostgresConnected) {
    try {
      const query = `
        SELECT 
          t.id,
          t.tenant_id,
          t.product_id,
          p.name AS product_name,
          t.short_code,
          t.title,
          t.description,
          t.category,
          t.severity,
          t.status,
          t.reporter_email,
          t.assigned_squad,
          t.assigned_to,
          t.assigned_to_name,
          t.domain_origin,
          t.rating,
          t.sla_due_at,
          t.created_at,
          t.updated_at,
          tm.page_url,
          tm.app_version,
          tm.user_agent,
          tm.viewport_dimensions,
          tm.console_logs,
          tm.network_errors,
          tm.encrypted_sensitive_data
        FROM tickets t
        LEFT JOIN products p ON t.product_id = p.id
        LEFT JOIN ticket_telemetry tm ON t.id = tm.ticket_id
        WHERE t.tenant_id = $1
        ORDER BY t.created_at DESC;
      `;
      const result = await pool.query(query, [targetTenantUuid]);
      tickets = result.rows.map(row => ({
        id: row.id,
        tenant_id: tenantId,
        product_id: row.product_id,
        product_name: row.product_name || 'Core Platform & Telemetry',
        domain_origin: row.domain_origin || undefined,
        short_code: row.short_code,
        title: row.title,
        description: row.description,
        category: row.category,
        severity: row.severity,
        status: row.status,
        rating: row.rating ? Number(row.rating) : undefined,
        reporter_email: row.reporter_email,
        assigned_squad: row.assigned_squad,
        assigned_to: row.assigned_to || undefined,
        assigned_to_name: row.assigned_to_name || undefined,
        sla_due_at: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : new Date().toISOString(),
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        telemetry: row.page_url ? {
          page_url: row.page_url,
          app_version: row.app_version,
          user_agent: row.user_agent,
          viewport_dimensions: row.viewport_dimensions,
          console_logs: row.console_logs || [],
          network_errors: row.network_errors || [],
          encrypted_sensitive_data: row.encrypted_sensitive_data
        } : undefined
      }));
    } catch (dbErr) {
      console.error('[Supabase Fetch Tickets Error]', dbErr);
      tickets = tenantStore.tickets.filter(t => t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid);
    }
  } else {
    tickets = tenantStore.tickets.filter(t => t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid);
  }

  // Dynamic Granular Permission Check for Telemetry
  const canViewInternalTelemetry = tenantStore.hasPermission(tenantId, userRole, 'tickets:view_telemetry_internal');

  tickets = tickets.map(t => ({
    ...t,
    telemetry: sanitizeTelemetry(t.telemetry, canViewInternalTelemetry, userRole, false)
  }));

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
  const targetTenantUuid = toTenantUuid(tenantId);

  tenantStore.tickets = tenantStore.tickets.filter(t => t.tenant_id !== tenantId && toTenantUuid(t.tenant_id) !== targetTenantUuid);
  tenantStore.events = tenantStore.events.filter(e => e.tenant_id !== tenantId && toTenantUuid(e.tenant_id) !== targetTenantUuid);

  if (isPostgresConnected) {
    try {
      await pool.query('DELETE FROM tickets WHERE tenant_id = $1', [targetTenantUuid]);
      await pool.query('DELETE FROM ticket_events WHERE tenant_id = $1', [targetTenantUuid]);
    } catch (err) {
      console.error('[Database Clear Error]', err);
    }
  }

  tenantStore.saveToDisk();
  broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket: null as any, event: null as any });
  res.json({ success: true, message: 'All tickets cleared successfully for current tenant.' });
});

// 2. GET SINGLE TICKET WITH FULL TELEMETRY & EVENT STREAM
ticketRouter.get('/:id', requirePermission('tickets:view'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const targetTenantUuid = toTenantUuid(tenantId);

  let ticket: Ticket | undefined;
  let events: TicketEvent[] = [];

  if (isPostgresConnected) {
    try {
      const query = `
        SELECT 
          t.id,
          t.tenant_id,
          t.product_id,
          p.name AS product_name,
          t.short_code,
          t.title,
          t.description,
          t.category,
          t.severity,
          t.status,
          t.reporter_email,
          t.assigned_squad,
          t.assigned_to,
          t.assigned_to_name,
          t.domain_origin,
          t.rating,
          t.sla_due_at,
          t.created_at,
          t.updated_at,
          tm.page_url,
          tm.app_version,
          tm.user_agent,
          tm.viewport_dimensions,
          tm.console_logs,
          tm.network_errors,
          tm.encrypted_sensitive_data
        FROM tickets t
        LEFT JOIN products p ON t.product_id = p.id
        LEFT JOIN ticket_telemetry tm ON t.id = tm.ticket_id
        WHERE (t.id::text = $1 OR t.short_code = $1) AND t.tenant_id = $2
        LIMIT 1;
      `;
      const result = await pool.query(query, [id, targetTenantUuid]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        ticket = {
          id: row.id,
          tenant_id: tenantId,
          product_id: row.product_id,
          product_name: row.product_name || 'Core Platform & Telemetry',
          domain_origin: row.domain_origin || undefined,
          short_code: row.short_code,
          title: row.title,
          description: row.description,
          category: row.category,
          severity: row.severity,
          status: row.status,
          rating: row.rating ? Number(row.rating) : undefined,
          reporter_email: row.reporter_email,
          assigned_squad: row.assigned_squad,
          assigned_to: row.assigned_to || undefined,
          assigned_to_name: row.assigned_to_name || undefined,
          sla_due_at: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : new Date().toISOString(),
          created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          telemetry: row.page_url ? {
            page_url: row.page_url,
            app_version: row.app_version,
            user_agent: row.user_agent,
            viewport_dimensions: row.viewport_dimensions,
            console_logs: row.console_logs || [],
            network_errors: row.network_errors || [],
            encrypted_sensitive_data: row.encrypted_sensitive_data
          } : undefined
        };

        const eventsRes = await pool.query(`
          SELECT te.id, te.ticket_id, te.tenant_id, te.event_type, te.content, te.is_internal_only, te.created_at, u.full_name AS author_name, u.role AS author_role
          FROM ticket_events te
          LEFT JOIN users u ON te.author_id = u.id
          WHERE te.ticket_id::text = $1 AND te.tenant_id = $2
          ORDER BY te.created_at ASC;
        `, [ticket.id, targetTenantUuid]);

        events = eventsRes.rows.map(r => ({
          id: r.id,
          ticket_id: r.ticket_id,
          tenant_id: tenantId,
          author_name: r.author_name || 'Team Member',
          author_role: r.author_role || 'developer',
          event_type: r.event_type,
          content: r.content,
          is_internal_only: Boolean(r.is_internal_only),
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
        }));
      }
    } catch (err) {
      console.error('[Supabase Fetch Ticket Detail Error]', err);
    }
  }

  if (!ticket) {
    ticket = tenantStore.tickets.find(t => (t.id === id || t.short_code === id) && (t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid));
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found in this tenant scope.' });
    }
    events = tenantStore.events.filter(e => (e.ticket_id === id || e.ticket_id === ticket?.id) && (e.tenant_id === tenantId || toTenantUuid(e.tenant_id) === targetTenantUuid));
  }

  // Dynamic Permission: Only roles granted 'tickets:view_internal_notes' can see internal quarantine notes
  const canViewInternalNotes = tenantStore.hasPermission(tenantId, userRole, 'tickets:view_internal_notes');
  if (!canViewInternalNotes) {
    events = events.filter(e => !e.is_internal_only);
  }

  // Dynamic Permission for Telemetry Inspection & Decryption
  const canViewInternalTelemetry = tenantStore.hasPermission(tenantId, userRole, 'tickets:view_telemetry_internal');
  const sanitizedTelemetry = sanitizeTelemetry(ticket.telemetry, canViewInternalTelemetry, userRole, true);

  res.json({
    ticket: {
      ...ticket,
      telemetry: sanitizedTelemetry
    },
    events
  });
});

// 3. UPDATE TICKET STATUS
ticketRouter.patch('/:id/status', requirePermission('tickets:change_status'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status, note } = req.body;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const targetTenantUuid = toTenantUuid(tenantId);

  if (!status || typeof status !== 'string') {
    return res.status(400).json({ error: 'Valid ticket status is required.' });
  }

  const normalizedStatus = normalizeDbStatus(status);

  // Support Agent safety guard
  if (userRole === 'support_agent' && normalizedStatus !== 'TRIAGED' && normalizedStatus !== 'OPEN') {
    return res.status(403).json({
      error: 'Permission Denied',
      code: 'FORBIDDEN',
      message: 'Support agents are authorized for triage (TRIAGED or OPEN). Advancing to IN_DEV or RESOLVED requires an engineering or lead role.'
    });
  }

  const ticket = tenantStore.tickets.find(t => (t.id === id || t.short_code === id) && (t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid));
  const oldStatus = ticket?.status || 'OPEN';

  if (ticket) {
    ticket.status = normalizedStatus;
    ticket.updated_at = new Date().toISOString();
  }

  // Live Supabase update
  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE tickets SET status = $1, updated_at = NOW() WHERE (id::text = $2 OR short_code = $2) AND tenant_id = $3`,
        [normalizedStatus, id, targetTenantUuid]
      );
      const tRes = await pool.query(
        `SELECT id FROM tickets WHERE (id::text = $1 OR short_code = $1) AND tenant_id = $2 LIMIT 1`,
        [id, targetTenantUuid]
      );
      const dbTicketId = tRes.rows[0]?.id;
      if (dbTicketId) {
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, tenant_id, event_type, content, is_internal_only, created_at)
           VALUES ($1, $2, 'STATUS_CHANGE', $3, false, NOW())`,
          [dbTicketId, targetTenantUuid, note || `Status changed from ${oldStatus} to ${normalizedStatus}.`]
        );
      }
    } catch (err) {
      console.error('[Supabase Status Update Error]', err);
    }
  }

  // Create timeline event in memory
  const event: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket?.id || id,
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
  if (ticket) {
    broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket, event });
  }

  res.json({
    message: 'Status updated successfully',
    ticket,
    event
  });
});

// 4. ADD TIMELINE EVENT / DEV NOTE
ticketRouter.post('/:id/events', requirePermission('tickets:view'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { content, is_internal_only } = req.body;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const targetTenantUuid = toTenantUuid(tenantId);

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Event content is required.' });
  }

  const ticket = tenantStore.tickets.find(t => (t.id === id || t.short_code === id) && (t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid));

  const canPostInternal = tenantStore.hasPermission(tenantId, userRole, 'tickets:create_internal_notes');
  const internalFlag = Boolean(is_internal_only && canPostInternal);

  if (isPostgresConnected) {
    try {
      const tRes = await pool.query(
        `SELECT id FROM tickets WHERE (id::text = $1 OR short_code = $1) AND tenant_id = $2 LIMIT 1`,
        [id, targetTenantUuid]
      );
      const dbTicketId = tRes.rows[0]?.id;
      if (dbTicketId) {
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, tenant_id, event_type, content, is_internal_only, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [dbTicketId, targetTenantUuid, internalFlag ? 'DEV_NOTE' : 'CLIENT_REPLY', content, internalFlag]
        );
      }
    } catch (err) {
      console.error('[Supabase Event Insert Error]', err);
    }
  }

  const event: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket?.id || id,
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

  broadcastTicketEvent(tenantId, 'NEW_EVENT', { ticketId: id, event }, internalFlag);

  res.status(201).json({
    message: 'Event recorded successfully',
    event
  });
});

// 5. EDIT & UPDATE TICKET
ticketRouter.put('/:id', requirePermission('tickets:edit'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;
  const targetTenantUuid = toTenantUuid(tenantId);
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

  const ticket = tenantStore.tickets.find(t => (t.id === id || t.short_code === id) && (t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid));
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found in this tenant scope.' });
  }

  if ((assigned_to !== undefined || assigned_squad !== undefined) && 
      (assigned_to !== ticket.assigned_to || assigned_squad !== ticket.assigned_squad)) {
    if (!tenantStore.hasPermission(tenantId, userRole, 'tickets:assign')) {
      return res.status(403).json({
        error: 'Permission Denied',
        message: `Your current role '${userRole}' is not granted 'tickets:assign' to reassign squads or developers.`
      });
    }
  }

  const oldStatus = ticket.status;
  const oldSeverity = ticket.severity;
  const oldAssignedTo = ticket.assigned_to;

  if (title !== undefined) ticket.title = title;
  if (description !== undefined) ticket.description = description;
  if (category !== undefined) ticket.category = category;
  if (severity !== undefined) ticket.severity = severity;
  if (status !== undefined) ticket.status = normalizeDbStatus(status);
  if (assigned_squad !== undefined) ticket.assigned_squad = assigned_squad;
  if (assigned_to !== undefined) ticket.assigned_to = assigned_to;
  if (assigned_to_name !== undefined) ticket.assigned_to_name = assigned_to_name;
  if (rating !== undefined) ticket.rating = Number(rating);
  ticket.updated_at = new Date().toISOString();

  // If live Postgres is connected, update Supabase DB
  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE tickets SET 
           title = $1, 
           description = $2, 
           category = $3, 
           severity = $4, 
           status = $5, 
           assigned_squad = $6, 
           assigned_to_name = $7, 
           rating = $8, 
           updated_at = NOW() 
         WHERE (id::text = $9 OR short_code = $9) AND tenant_id = $10`,
        [ticket.title, ticket.description, ticket.category, ticket.severity, ticket.status, ticket.assigned_squad, ticket.assigned_to_name || null, ticket.rating !== undefined ? ticket.rating : null, id, targetTenantUuid]
      );
    } catch (dbErr) {
      console.error('[Supabase Ticket Update Error]', dbErr);
    }
  }

  let eventType: 'STATUS_CHANGE' | 'ASSIGNED' = 'STATUS_CHANGE';
  let eventContent = `Ticket updated by ${req.auth!.fullName}. Status: ${oldStatus} -> ${ticket.status}, Severity: ${oldSeverity} -> ${ticket.severity}.`;

  if (assigned_to !== undefined && assigned_to !== oldAssignedTo) {
    eventType = 'ASSIGNED';
    eventContent = ticket.assigned_to_name 
      ? `Ticket assigned to developer ${ticket.assigned_to_name} by ${req.auth!.fullName}.` 
      : `Ticket unassigned by ${req.auth!.fullName}.`;
  }

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
ticketRouter.patch('/:id/assignee', requirePermission('tickets:assign'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { assigneeId, assigneeName } = req.body;
  const tenantId = req.auth!.tenantId;
  const targetTenantUuid = toTenantUuid(tenantId);

  const ticket = tenantStore.tickets.find(t => (t.id === id || t.short_code === id) && (t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid));
  if (ticket) {
    ticket.assigned_to = assigneeId || undefined;
    ticket.assigned_to_name = assigneeName || undefined;
    ticket.updated_at = new Date().toISOString();
  }

  if (isPostgresConnected) {
    try {
      await pool.query(
        `UPDATE tickets SET assigned_to = $1, assigned_to_name = $2, updated_at = NOW() WHERE (id::text = $3 OR short_code = $3) AND tenant_id = $4`,
        [assigneeId || null, assigneeName || null, id, targetTenantUuid]
      );
      const tRes = await pool.query(
        `SELECT id FROM tickets WHERE (id::text = $1 OR short_code = $1) AND tenant_id = $2 LIMIT 1`,
        [id, targetTenantUuid]
      );
      const dbTicketId = tRes.rows[0]?.id;
      if (dbTicketId) {
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, tenant_id, event_type, content, is_internal_only, created_at)
           VALUES ($1, $2, 'ASSIGNED', $3, false, NOW())`,
          [dbTicketId, targetTenantUuid, assigneeName ? `Reassigned to ${assigneeName}.` : 'Ticket marked as Unassigned.']
        );
      }
    } catch (err) {
      console.error('[Supabase Assignee Update Error]', err);
    }
  }

  const event: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: ticket?.id || id,
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

  if (ticket) {
    broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket, event });
    broadcastTicketEvent(tenantId, 'TICKET_ASSIGNED', { 
      tenantId, 
      tenant_id: tenantId, 
      ticket, 
      event, 
      message: assigneeName ? `Ticket ${ticket.short_code} assigned to ${assigneeName}.` : `Ticket ${ticket.short_code} unassigned.` 
    });
  }

  res.json({
    message: 'Assignee updated successfully',
    ticket,
    event
  });
});

// 7. CREATE NEW INCIDENT TICKET DYNAMICALLY (PERSIST TO SUPABASE)
ticketRouter.post('/', requirePermission('tickets:create'), async (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const targetTenantUuid = toTenantUuid(tenantId);
  const { title, description, category, severity, priority, assigned_to, assigned_to_name, reporter_email, telemetry } = req.body;

  const ticketCount = tenantStore.tickets.filter(t => t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid).length + 1;
  const shortCode = `FH-${400 + ticketCount}`;

  let ticketId = `ticket-${Date.now()}`;

  if (isPostgresConnected) {
    try {
      const prodRes = await pool.query('SELECT id, name FROM products WHERE tenant_id = $1 LIMIT 1', [targetTenantUuid]);
      const defaultProductId = prodRes.rows[0]?.id;

      const insertTicket = await pool.query(
        `INSERT INTO tickets (tenant_id, product_id, short_code, title, description, category, severity, status, reporter_email, assigned_squad, assigned_to_name, sla_due_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, 'CORE_ENGINEERING_SQUAD', $9, NOW() + INTERVAL '2 hours', NOW(), NOW())
         RETURNING id, short_code, created_at`,
        [
          targetTenantUuid,
          defaultProductId,
          shortCode,
          title || 'New Telemetry Incident',
          description || 'Ingested dynamically via Feedback-Hub API.',
          category || 'BUG',
          severity || priority || 'MEDIUM',
          reporter_email || req.auth!.email || 'oncall@feedbackhub.io',
          assigned_to_name || null
        ]
      );

      if (insertTicket.rows.length > 0) {
        ticketId = insertTicket.rows[0].id;
      }

      if (telemetry) {
        await pool.query(
          `INSERT INTO ticket_telemetry (ticket_id, tenant_id, page_url, app_version, user_agent, viewport_dimensions, console_logs, network_errors)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ticketId,
            targetTenantUuid,
            telemetry.page_url || null,
            telemetry.app_version || null,
            telemetry.user_agent || null,
            telemetry.viewport_dimensions || null,
            JSON.stringify(telemetry.console_logs || []),
            JSON.stringify(telemetry.network_errors || [])
          ]
        );
      }
    } catch (dbErr) {
      console.error('[Supabase Create Ticket Error]', dbErr);
    }
  }

  const newTicket: Ticket = {
    id: ticketId,
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

// 8. DELETE TICKET (FROM SUPABASE & MEMORY)
ticketRouter.delete('/:id', requirePermission('tickets:delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tenantId = req.auth!.tenantId;
  const targetTenantUuid = toTenantUuid(tenantId);

  const ticketIndex = tenantStore.tickets.findIndex(t => (t.id === id || t.short_code === id) && (t.tenant_id === tenantId || toTenantUuid(t.tenant_id) === targetTenantUuid));
  let deletedShortCode = id;
  if (ticketIndex !== -1) {
    const [deletedTicket] = tenantStore.tickets.splice(ticketIndex, 1);
    deletedShortCode = deletedTicket.short_code;
  }

  // Cascade delete associated events in memory
  tenantStore.events = tenantStore.events.filter(e => e.ticket_id !== id);

  // If live Postgres is connected, delete from Supabase DB
  if (isPostgresConnected) {
    try {
      await pool.query(
        `DELETE FROM tickets WHERE (id::text = $1 OR short_code = $1) AND tenant_id = $2`,
        [id, targetTenantUuid]
      );
    } catch (dbErr) {
      console.error('[Supabase Delete Error]', dbErr);
    }
  }

  tenantStore.saveToDisk();

  // Broadcast real-time deletion
  broadcastTicketEvent(tenantId, 'TICKET_DELETED', {
    ticketId: id,
    shortCode: deletedShortCode,
    message: `[DELETED] Ticket ${deletedShortCode} was removed.`
  });

  res.json({
    success: true,
    message: `Ticket ${deletedShortCode} permanently deleted.`,
    ticket_id: id
  });
});
