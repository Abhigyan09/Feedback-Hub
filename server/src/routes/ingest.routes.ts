import { Router, Request, Response } from 'express';
import { tenantStore } from '../config/db.js';
import { broadcastTicketEvent } from '../services/socket.js';
import { encryptSensitiveData } from '../services/crypto.js';
import { Ticket, TicketEvent } from '../types/index.js';

export const ingestRouter = Router();

// PUBLIC ENDPOINT FOR EMBEDDED WIDGET / SDK
ingestRouter.post('/ticket', (req: Request, res: Response) => {
  const productKey = (req.headers['x-product-key'] as string) || (req.body.product_key as string);
  const { 
    title, 
    description, 
    category = 'BUG', 
    severity = 'MEDIUM', 
    rating, 
    screenshot, 
    reporter_email, 
    telemetry, 
    sensitive_data 
  } = req.body;

  // 1. Authoritative Product & Tenant Lookup (Zero-Leakage: client never sets tenant_id)
  if (!productKey) {
    return res.status(401).json({ error: 'Invalid or missing X-Product-Key header' });
  }

  const product = tenantStore.products.find(p => p.raw_api_key === productKey || p.api_key_hash === productKey);
  if (!product) {
    return res.status(401).json({ error: 'Unrecognized product key' });
  }

  const tenant = tenantStore.tenants.find(t => t.id === product.tenant_id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant associated with product not found' });
  }

  // 2. Extract and Normalize Domain Origin
  let domainOrigin = telemetry?.domain_origin;
  if (!domainOrigin && telemetry?.page_url) {
    try {
      const url = new URL(telemetry.page_url);
      domainOrigin = url.hostname;
    } catch {
      domainOrigin = telemetry.page_url.split('/')[2] || 'app.client.com';
    }
  }
  if (!domainOrigin) {
    const rawOrigin = (req.headers['origin'] || req.headers['referer'] || '') as string;
    domainOrigin = rawOrigin ? rawOrigin.replace(/^https?:\/\//, '').split('/')[0].split(':')[0] : 'client.app';
  }

  // 3. Dynamic Squad & SLA Routing based on Form Category and Severity
  let assignedSquad = 'FRONTEND_PORTAL';
  let slaMinutes = 120; // 2 hours default

  const normalizedCategory = String(category).toUpperCase();
  const normalizedSeverity = String(severity).toUpperCase();

  if (normalizedCategory === 'BUG' || normalizedCategory === 'API_FAILURE') {
    if (normalizedSeverity === 'URGENT' || normalizedSeverity === 'CRITICAL' || normalizedSeverity === 'BLOCKER') {
      assignedSquad = 'CORE_ENGINEERING_SQUAD';
      slaMinutes = 30; // 30-min urgent response
    } else {
      assignedSquad = 'FRONTEND_PORTAL';
      slaMinutes = 120;
    }
  } else if (normalizedCategory === 'IDEA' || normalizedCategory === 'FEATURE_REQUEST') {
    assignedSquad = 'PRODUCT_DESIGN_SQUAD';
    slaMinutes = 7 * 24 * 60; // 7 days review window
  } else if (normalizedCategory === 'HELP') {
    assignedSquad = 'CLIENT_SUPPORT_SQUAD';
    slaMinutes = 60; // 1 hour for help inquiries
  } else if (normalizedCategory === 'RATING') {
    assignedSquad = 'CUSTOMER_SUCCESS_SQUAD';
    slaMinutes = 24 * 60; // 24 hours
  }

  // 4. Generate Short Code
  const ticketCount = tenantStore.tickets.filter(t => t.tenant_id === tenant.id).length + 1;
  const shortCode = `FB-${1040 + ticketCount}`;

  // 5. Encrypt Sensitive Data if Provided
  let encryptedData: string | undefined = undefined;
  if (sensitive_data) {
    encryptedData = encryptSensitiveData(typeof sensitive_data === 'string' ? sensitive_data : JSON.stringify(sensitive_data));
  }

  // 6. Build New Ticket Model
  const newTicket: Ticket = {
    id: `ticket-${Date.now()}`,
    tenant_id: tenant.id,
    product_id: product.id,
    product_name: product.name,
    domain_origin: domainOrigin,
    short_code: shortCode,
    title: title || `${normalizedCategory}: Client Feedback from ${domainOrigin}`,
    description: description || 'No additional details provided.',
    category: normalizedCategory as any,
    severity: normalizedSeverity as any,
    rating: rating ? Number(rating) : undefined,
    screenshot_url: screenshot || telemetry?.screenshot_url,
    status: 'OPEN',
    reporter_email: reporter_email || 'client-user@enterprise.com',
    assigned_squad: assignedSquad,
    sla_due_at: new Date(Date.now() + slaMinutes * 60000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    telemetry: {
      ...telemetry,
      domain_origin: domainOrigin,
      screenshot_url: screenshot || telemetry?.screenshot_url,
      encrypted_sensitive_data: encryptedData
    }
  };

  tenantStore.tickets.unshift(newTicket);

  // 7. Initial System Timeline Event
  const initialEvent: TicketEvent = {
    id: `ev-${Date.now()}`,
    ticket_id: newTicket.id,
    tenant_id: tenant.id,
    author_name: 'Feedback-Hub Ingest Engine',
    author_role: 'developer',
    event_type: 'STATUS_CHANGE',
    content: `Ticket automatically ingested for product '${product.name}' from domain '${domainOrigin}'. Routed to squad [${assignedSquad}].`,
    is_internal_only: false,
    created_at: new Date().toISOString()
  };
  tenantStore.events.push(initialEvent);

  // 8. Real-time Broadcast Scoped Strictly to Tenant Room
  broadcastTicketEvent(tenant.id, 'NEW_TICKET_ALERT', {
    ticket: newTicket,
    message: `[${newTicket.category}] ${newTicket.short_code} on ${product.name} (${domainOrigin}): ${newTicket.title}`
  });

  res.status(201).json({
    success: true,
    message: 'Feedback submitted successfully.',
    ticket: newTicket,
    ticket_id: newTicket.id,
    short_code: newTicket.short_code,
    product_name: product.name,
    domain: domainOrigin
  });
});
