import { Router, Request, Response } from 'express';
import { tenantStore } from '../config/db.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { encryptSensitiveData } from '../services/crypto.js';
import { Ticket, TicketEvent } from '../types/index.js';

export const ingestRouter = Router();

// PUBLIC ENDPOINT FOR EMBEDDED WIDGET / SDK
ingestRouter.post('/ticket', (req: Request, res: Response) => {
  const productKey = req.headers['x-product-key'] as string;
  const { title, description, category, severity, reporter_email, telemetry, sensitive_data } = req.body;

  // Validate product key
  const product = tenantStore.products.find(p => p.raw_api_key === productKey || p.api_key_hash === productKey);
  if (!product) {
    return res.status(401).json({ error: 'Invalid or missing X-Product-Key' });
  }

  const tenant = tenantStore.tenants.find(t => t.id === product.tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant associated with product not found' });
  }

  // Generate human-friendly short code
  const ticketCount = tenantStore.tickets.filter(t => t.tenant_id === tenant.id).length + 1;
  const shortCode = `FB-${1040 + ticketCount}`;

  // Encrypt sensitive payload if provided
  let encryptedData: string | undefined = undefined;
  if (sensitive_data) {
    encryptedData = encryptSensitiveData(typeof sensitive_data === 'string' ? sensitive_data : JSON.stringify(sensitive_data));
  }

  // Create new ticket
  const newTicket: Ticket = {
    id: `ticket-${Date.now()}`,
    tenant_id: tenant.id,
    product_id: product.id,
    product_name: product.name,
    short_code: shortCode,
    title: title || 'Automated Incident Telemetry Report',
    description: description || 'Captured automatically via embedded client telemetry SDK.',
    category: category || 'BUG',
    severity: severity || 'MEDIUM',
    status: 'OPEN',
    reporter_email: reporter_email || 'anonymous-user@client-app.com',
    assigned_squad: category === 'API_FAILURE' ? 'CORE_API_SQUAD' : 'FRONTEND_PORTAL',
    sla_due_at: new Date(Date.now() + 120 * 60000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    telemetry: {
      ...telemetry,
      encrypted_sensitive_data: encryptedData
    }
  };

  tenantStore.tickets.unshift(newTicket);

  // Initial event
  const initialEvent: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: newTicket.id,
    tenant_id: tenant.id,
    author_name: 'Feedback-Hub Ingest Engine',
    author_role: 'developer',
    event_type: 'STATUS_CHANGE',
    content: `Ticket automatically ingested via embedded SDK for product '${product.name}'.`,
    is_internal_only: false,
    created_at: new Date().toISOString()
  };
  tenantStore.events.push(initialEvent);

  // Real-time broadcast to developers
  broadcastTicketEvent(tenant.id, 'NEW_TICKET_ALERT', {
    ticket: newTicket,
    message: `[ALERT] New ${newTicket.severity} incident reported on ${product.name}: ${newTicket.title}`
  });

  res.status(201).json({
    success: true,
    message: 'Telemetry and feedback ingested successfully.',
    ticket_id: newTicket.id,
    short_code: newTicket.short_code
  });
});
