import { Router, Request, Response } from 'express';
import { tenantStore } from '../config/db.js';
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

  // If client user, strip confidential internal dev telemetry details
  if (userRole === 'client_user') {
    tickets = tickets.map(t => ({
      ...t,
      telemetry: t.telemetry ? {
        page_url: t.telemetry.page_url,
        app_version: t.telemetry.app_version
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

  // Strict RBAC: Client users cannot view internal developer notes
  if (userRole === 'client_user') {
    events = events.filter(e => !e.is_internal_only);
  }

  // Decrypt telemetry if developer/lead
  let decryptedTelemetry = ticket.telemetry;
  if (['super_admin', 'tenant_admin', 'squad_lead', 'developer'].includes(userRole) && ticket.telemetry?.encrypted_sensitive_data) {
    decryptedTelemetry = {
      ...ticket.telemetry,
      encrypted_sensitive_data: decryptSensitiveData(ticket.telemetry.encrypted_sensitive_data)
    };
  }

  res.json({
    ticket: {
      ...ticket,
      telemetry: decryptedTelemetry
    },
    events
  });
});

// 3. UPDATE TICKET STATUS (Requires Developer or Squad Lead Role)
ticketRouter.patch('/:id/status', requireRole(['super_admin', 'tenant_admin', 'squad_lead', 'developer']), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, note } = req.body;
  const tenantId = req.auth!.tenantId;

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
