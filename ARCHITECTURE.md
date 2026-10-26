# FEEDBACK-HUB: ENTERPRISE TECHNICAL ARCHITECTURE BLUEPRINT

> **Target Architecture:** Multi-Tenant PERN Stack (PostgreSQL 16 + Express/Node 20 + React 18 + TypeScript)  
> **Security Level:** Bank-Grade / SOC2 Aligned (AES-256-GCM, Row Level Security, Rotating Refresh Tokens)  
> **Design Philosophy:** Stripe Squarish (High-contrast, 0–2px radii, monospaced metrics, micro-animations)


## 1. Idea Assessment & Enterprise Business Evaluation

### The Problem It Solves
Inside fast-moving product companies and digital consultancies, the **"Client-to-Engineering Gap"** is the #1 cause of lost engineering hours and client dissatisfaction:
1. **The Reproduction Ping-Pong:** Clients report bugs vaguely ("API is down" or "login broken"). Engineers spend 4 hours attempting to reproduce it because they lack the URL, User-Agent, failed request payload, and console stack traces.
2. **Channel Clutter:** Feedback is scattered across Slack, WhatsApp, emails, and Zoom calls.
3. **Internal vs. External Friction:** Developers need dirty technical details (stack traces, SQL errors, raw payloads), but clients need clean, reassuring progress updates ("Investigating" -> "Fix in Staging" -> "Deployed").

### Why Your Idea is a High-Value Strategic Win
* **Internal Operational Superpower:** Slashing Mean Time to Resolution (MTTR) by up to 65% because tickets land directly in the on-call engineer's queue with telemetry attached.
* **Client Trust Booster:** Clients feel heard immediately with live status tracking rather than a black-hole ticketing experience.
* **Enterprise B2B Expansion Path:** Once proven on internal products, packaging this as a self-hosted or SaaS observability bridge for software agencies and API platforms gives you a high-margin enterprise product.

---

## 2. Multi-Tenant Isolation Strategy (Row-Level Security)

To ensure zero cross-tenant data leakage while maintaining operational efficiency, we utilize **PostgreSQL 16 Row Level Security (RLS)** with tenant session binding:

```
[ Incoming Request ]
        │
        ▼
[ Auth Middleware ] ─── Validates JWT & extracts { tenant_id, role, user_id }
        │
        ▼
[ DB Pool Transaction ] ─── Executes:
                            SET LOCAL app.current_tenant_id = 'tenant-uuid';
                            SET LOCAL app.current_user_role = 'developer';
        │
        ▼
[ PostgreSQL Engine ] ─── Automatically enforces RLS policies at the kernel level
```

### Express.js Tenant Binding Middleware (`src/middleware/tenantContext.ts`)
```typescript
import { Request, Response, NextFunction } from 'express';
import { PoolClient } from 'pg';
import { pool } from '../config/database';

export interface AuthenticatedUser {
  id: string;
  tenant_id: string;
  role: 'super_admin' | 'tenant_admin' | 'squad_lead' | 'developer' | 'support_agent' | 'client_user';
  email: string;
}

export const withTenantContext = async (
  req: Request & { user?: AuthenticatedUser; dbClient?: PoolClient },
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.tenant_id) {
    return res.status(401).json({ error: 'Unauthorized: Missing tenant context' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_tenant_id = $1`, [req.user.tenant_id]);
    await client.query(`SET LOCAL app.current_user_role = $1`, [req.user.role]);
    
    req.dbClient = client;

    // Release back on response finish
    res.on('finish', async () => {
      try {
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    next();
  } catch (error) {
    client.release();
    next(error);
  }
};
```

---

## 3. Bank-Grade Security & Encryption Architecture

### Cryptographic Safeguards
1. **PII Field-Level Encryption:** Sensitive payload keys, authorization headers, and client tokens are encrypted via **AES-256-GCM** with a rotating 256-bit Master Key before hitting PostgreSQL.
2. **Rotating Refresh Token Families:** Refresh tokens are single-use. If a token reuse attempt is detected, the entire token family is immediately revoked, neutralizing stolen tokens.
3. **Argon2id Hashing:** User passwords hashed using memory-hard Argon2id (v=19, m=65536, t=3, p=4).
4. **Rate Limiting:** Redis Token Bucket on public widget ingestion endpoints (`/api/v1/ingest/*`) limited to 30 requests/min per IP to prevent spam and DDoS.

### AES-256-GCM Cryptographic Service (`src/services/crypto.ts`)
```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const KEY = Buffer.from(process.env.ENCRYPTION_KEY_AES256 || '', 'hex');

export const encryptSensitiveData = (plaintext: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
};

export const decryptSensitiveData = (cipherPayload: string): string => {
  const [ivHex, tagHex, encryptedHex] = cipherPayload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
```

---

## 4. Enterprise RBAC Middleware (`src/middleware/rbac.ts`)

```typescript
import { Request, Response, NextFunction } from 'express';

export type UserRole = 'super_admin' | 'tenant_admin' | 'squad_lead' | 'developer' | 'support_agent' | 'client_user';

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role as UserRole;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges for this operation',
        required_roles: allowedRoles,
        current_role: userRole || 'anonymous'
      });
    }
    next();
  };
};
```

---

## 5. Embeddable Client SDK Architecture (`sdk/feedback-hub.js`)

Lightweight (<15KB), zero-dependency client widget embedded into any frontend (React, Next.js, Vue, or Vanilla HTML):

```javascript
(function(window, document) {
  const SCRIPT_TAG = document.currentScript;
  const PRODUCT_KEY = SCRIPT_TAG.getAttribute('data-product-key');
  const ENDPOINT = SCRIPT_TAG.getAttribute('data-endpoint') || 'https://hub.yourdomain.com';

  const collectedErrors = [];

  // 1. Intercept Global Window Errors
  window.addEventListener('error', function(event) {
    collectedErrors.push({
      type: 'JS_EXCEPTION',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      time: new Date().toISOString()
    });
  });

  // 2. Intercept Failed Fetch Calls (Telemetry)
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    try {
      const response = await originalFetch.apply(this, args);
      if (!response.ok && response.status >= 400) {
        collectedErrors.push({
          type: 'API_FAILURE',
          url: typeof args[0] === 'string' ? args[0] : args[0].url,
          status: response.status,
          time: new Date().toISOString()
        });
      }
      return response;
    } catch (err) {
      collectedErrors.push({
        type: 'NETWORK_DISCONNECT',
        error: err.message,
        time: new Date().toISOString()
      });
      throw err;
    }
  };

  // 3. Expose Trigger API
  window.FeedbackHub = {
    openModal: function() {
      // Renders clean Stripe-squarish modal with collectedErrors pre-attached
    },
    submit: async function(payload) {
      return originalFetch(`${ENDPOINT}/api/v1/ingest/ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Product-Key': PRODUCT_KEY
        },
        body: JSON.stringify({
          ...payload,
          telemetry: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            errors: collectedErrors.slice(-10) // Last 10 errors
          }
        })
      });
    }
  };
})(window, document);
```

---

## 6. Stripe Squarish UI Design System Specification

### Design Principles
* **Sharp Contours:** 0px to 2px radii (`rounded-none` / `rounded-xs`). Never round buttons or cards into pills.
* **1px Crisp Borders:** High-contrast borders (`border-neutral-200` light / `border-neutral-800` dark).
* **Typography:** `Inter` or `Geist Sans` with `-0.02em` tracking for headings; `JetBrains Mono` for IDs, status codes, and latency numbers.
* **Subtle Micro-interactions:** Instant hover contrast adjustments (`bg-neutral-50` -> `bg-neutral-100`), smooth accordion drawers for telemetry payloads.
* **Power-User Ergonomics:** Global `Cmd+K` command palette to jump across tickets, products, and squad triage queues.

### Squarish Card Component (`src/components/ui/SquarishCard.tsx`)
```tsx
import React from 'react';

interface SquarishCardProps {
  title: string;
  badge?: string;
  badgeType?: 'danger' | 'warning' | 'success' | 'neutral';
  children: React.ReactNode;
}

export const SquarishCard: React.FC<SquarishCardProps> = ({ title, badge, badgeType = 'neutral', children }) => {
  const badgeStyles = {
    danger: 'bg-red-950 text-red-400 border-red-800',
    warning: 'bg-amber-950 text-amber-400 border-amber-800',
    success: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    neutral: 'bg-neutral-900 text-neutral-400 border-neutral-700'
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-none p-5 shadow-none transition-colors hover:border-neutral-700">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-4">
        <h3 className="font-mono text-xs uppercase tracking-wider text-neutral-300 font-semibold">{title}</h3>
        {badge && (
          <span className={`font-mono text-[10px] px-2 py-0.5 border ${badgeStyles[badgeType]} uppercase font-medium`}>
            • {badge}
          </span>
        )}
      </div>
      <div className="text-neutral-300 text-sm">{children}</div>
    </div>
  );
};
```

---

## 7. Real-Time Event Dispatch Engine (WebSockets + Redis)

```
[ Ingest Endpoint ] ─── Saves Ticket to PostgreSQL
        │
        ▼
[ Redis Pub/Sub ] ──── Publishes to channel `events:tenant_{id}`
        │
        ├──────► [ Instance 1 WebSocket Gateway ] ───► Broadcasts to Squad Room
        └──────► [ Instance 2 WebSocket Gateway ] ───► Broadcasts to Squad Room
```

* **Zero Polling:** Engineers on duty receive instant visual toast & audio chime in `< 120ms` of client submission.
* **SLA Timers:** Background worker calculates breach countdowns; sends escalated webhook to Slack `#api-war-room` if high-severity ticket remains unassigned for > 15 minutes.
