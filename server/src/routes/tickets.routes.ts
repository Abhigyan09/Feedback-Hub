import { Router, Request, Response } from 'express';
import { tenantStore, isPostgresConnected, pool } from '../config/db.js';
import { requireRole } from '../middleware/rbac.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { decryptSensitiveData } from '../services/crypto.js';
import { TicketEvent } from '../types/index.js';

export const ticketRouter = Router();

// 1. GET ALL TICKETS FOR CURRENT TENANT
ticketRouter.get('/', (req: Request, res: Response) => {
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  // STRICT MULTI-TENANT FILTER
  let tickets = tenantStore.tickets.filter(t => t.tenant_id === tenantId);

  // Strict RBAC: Strip confidential internal telemetry details based on role
  if (userRole === 'client_user') {
    tickets = tickets.map(t => ({
      ...t,
      telemetry: t.telemetry ? {
        page_url: t.telemetry.page_url,
        app_version: t.telemetry.app_version,
        viewport_dimensions: t.telemetry.viewport_dimensions,
        screenshot_url: t.telemetry.screenshot_url
      } : undefined
    }));
  } else if (userRole === 'support_agent') {
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
  }

  res.json({
    tenant_id: tenantId,
    user_role: userRole,
    count: tickets.length,
    tickets
  });
});

// 2. GET SINGLE TICKET WITH FULL TELEMETRY & EVENT STREAM
ticketRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found in this tenant scope.' });
  }

  // Fetch events for this ticket
  let events = tenantStore.events.filter(e => e.ticket_id === id && e.tenant_id === tenantId);

  // Strict RBAC: Client users and support agents cannot view internal developer quarantine notes
  if (userRole === 'client_user' || userRole === 'support_agent') {
    events = events.filter(e => !e.is_internal_only);
  }

  // Strict RBAC for telemetry:
  let sanitizedTelemetry = ticket.telemetry ? { ...ticket.telemetry } : undefined;

  if (sanitizedTelemetry) {
    if (userRole === 'client_user') {
      // Clients only see user environment, no internal logs or bank encrypted secrets
      delete sanitizedTelemetry.console_logs;
      delete sanitizedTelemetry.network_errors;
      delete sanitizedTelemetry.encrypted_sensitive_data;
    } else if (userRole === 'support_agent') {
      // Support sees network status, but no decrypted AES sensitive payloads or raw browser consoles
      delete sanitizedTelemetry.console_logs;
      delete sanitizedTelemetry.encrypted_sensitive_data;
    } else if (['super_admin', 'tenant_admin', 'squad_lead', 'developer'].includes(userRole)) {
      // Engineering and admins decrypt sensitive data
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

// 3. UPDATE TICKET STATUS (Requires Developer, Squad Lead, Admin, or Support Triage)
ticketRouter.patch('/:id/status', requireRole(['super_admin', 'tenant_admin', 'squad_lead', 'developer', 'support_agent']), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, note } = req.body;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  // Support Agent RBAC guard
  if (userRole === 'support_agent' && status !== 'TRIAGED' && status !== 'OPEN') {
    return res.status(403).json({
      error: 'Permission Denied',
      message: 'Support agents are only authorized to triage tickets to TRIAGED or OPEN. Advancing to IN_DEV or RESOLVED requires an engineering or lead role.'
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

  // Real-time broadcast
  broadcastTicketEvent(tenantId, 'TICKET_UPDATED', { ticket, event });

  res.json({
    message: 'Status updated successfully',
    ticket,
    event
  });
});

// 4. ADD TIMELINE EVENT / DEV NOTE
ticketRouter.post('/:id/events', (req: Request, res: Response) => {
  const { id } = req.params;
  const { content, is_internal_only } = req.body;
  const tenantId = req.auth!.tenantId;
  const userRole = req.auth!.role;

  const ticket = tenantStore.tickets.find(t => t.id === id && t.tenant_id === tenantId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // Client cannot create internal dev notes
  const internalFlag = userRole === 'client_user' ? false : Boolean(is_internal_only);

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

  // Real-time broadcast respecting quarantine
  broadcastTicketEvent(tenantId, 'NEW_EVENT', { ticketId: id, event }, internalFlag);

  res.status(201).json({
    message: 'Event recorded successfully',
    event
  });
});

// 5. EDIT & UPDATE TICKET (Requires Developer or Squad Lead Role)
ticketRouter.put('/:id', requireRole(['super_admin', 'tenant_admin', 'squad_lead', 'developer']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.auth!.tenantId;
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
        `UPDATE tickets SET title = $1, description = $2, category = $3, severity = $4, status = $5, assigned_squad = $6, updated_at = NOW() WHERE id = $7 AND tenant_id = $8`,
        [ticket.title, ticket.description, ticket.category, ticket.severity, ticket.status, ticket.assigned_squad, id, tenantId]
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

// 6. DELETE TICKET (Requires Squad Lead or Administrator Role)
ticketRouter.delete('/:id', requireRole(['super_admin', 'tenant_admin', 'squad_lead']), async (req: Request, res: Response) => {
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
