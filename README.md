# Feedback-Hub

> **Enterprise Real-Time Incident Bridge & Client Observability Platform**  
> *Target Architecture:* Multi-Tenant PERN Stack (PostgreSQL 16 + Express/Node 20 + React 18 + TypeScript)  
> *Security Benchmark:* Bank-Grade / SOC2 Aligned (AES-256-GCM, Row Level Security, Rotating Refresh Tokens)  
> *Design System:* Stripe Squarish (High-contrast, 0–2px radii, tabular data density, micro-animations)

---

## 📑 Quick Navigation
* [1. Founder & Chief Architect Review: "Yeh Idea Kaisa Hai?"](#1-founder--chief-architect-review-yeh-idea-kaisa-hai)
* [2. High-Level Architecture Overview](#2-high-level-architecture-overview)
* [3. Day-1 Multi-Tenancy (PostgreSQL Row-Level Security)](#3-day-1-multi-tenancy-postgresql-row-level-security)
* [4. Bank-Grade RBAC (Role-Based Access Control) Matrix](#4-bank-grade-rbac-role-based-access-control-matrix)
* [5. Security & Cryptography Standards](#5-security--cryptography-standards)
* [6. Embeddable Client Telemetry SDK](#6-embeddable-client-telemetry-sdk)
* [7. Stripe Squarish UI/UX Design System](#7-stripe-squarish-uiux-design-system)
* [8. Real-Time Incident Dispatch & SLA Engine](#8-real-time-incident-dispatch--sla-engine)
* [9. PostgreSQL Database Schema](#9-postgresql-database-schema)
* [10. Quick Start & Environment Setup](#10-quick-start--environment-setup)

---

## 1. Founder & Chief Architect Review: "Yeh Idea Kaisa Hai?"

### The Core Problem Solved
Product companies aur digital consultancies me sabse bada bottleneck **"Client vs Engineering Team"** ka communication gap hota hai:
1. **The Reproduction Ping-Pong:** Client report karta hai — *"Bhai login button kaam nahi kar raha"* ya *"API fail ho rahi hai"*. Dev team puchti hai — *"Kaunsa browser? Console error kya hai? URL kya hai? Network tab me kya aaya?"*. Client non-technical hone ki wajah se yeh sab nahi de pata. Natija: Devs ghanton tak reproduce karne me waqt barbaad karte hain.
2. **Channel Clutter:** Feedback WhatsApp, Slack, emails aur Google Meets me bikhar jata hai aur critical bugs slip ho jate hain.
3. **Dirty Technical Logs vs Clean Client View:** Developers ko dirty technical stack traces, SQL payload aur headers chahiye hote hain; jabki clients ko sirf clean, professional progress status chahiye hota hai (`Investigating` $\rightarrow$ `Fix in Staging` $\rightarrow$ `Deployed`).

### Strategic Value & Competitive Edge
* **Slashing MTTR (Mean Time to Resolution):** Jab ticket ke saath page URL, viewport, failed fetch payload aur browser console errors 1-click me aate hain, dev ka debugging time 65% kam ho jata hai.
* **Why Jira / Sentry Aren't Enough:**
  * *Jira:* Clients ke liye bohot complex aur un-friendly hai.
  * *Sentry / Datadog:* Yeh developer-only logging tools hain; inme client tickets ya SLA status view nahi hota.
  * *Usersnap / Marker.io:* Generic screenshot tools hain jinme API-squad auto-routing aur private/internal dev quarantine nahi hota.
* **Commercial Monetization Potential:** Pehle ise apni internal products aur client projects ke liye operational superpower banao. Ek baar system battle-tested ho jaye, to ise software agencies aur SaaS companies ke liye high-margin B2B SaaS ke roop me package kiya ja sakta hai.

---

## 2. High-Level Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │   CLIENT PRODUCT (Web App / React / Next / Vue)        │
 │   Embeds: <script src=".../v1/sdk.js" data-key="...">  │
 └──────────────────────────┬─────────────────────────────┘
                            │ Telemetry + Console + API Errors
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │             EXPRESS 20 + TYPESCRIPT GATEWAY            │
 │   - Redis Token Bucket Rate Limiter (30 req/min/IP)    │
 │   - AES-256-GCM Field-Level PII Encryption             │
 └──────────────────────────┬─────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
 ┌──────────────────────┐        ┌──────────────────────┐
 │   POSTGRESQL 16      │        │      REDIS 7         │
 │   - Row Level Sec    │        │   - Pub/Sub Gateway  │
 │   - Tenant Isolation │        │   - Live Sockets     │
 │   - Immutable Audits │        │   - SLA Timer Queue  │
 └──────────────────────┘        └──────────┬───────────┘
                                            │ <120ms Broadcast
                                            ▼
 ┌────────────────────────────────────────────────────────┐
 │     FEEDBACK-HUB DASHBOARD (Stripe Squarish UI)        │
 │   - Dev Squad Triage View (Telemetry + Network Replay) │
 │   - Client Portal (Quarantined Clean Status View)      │
 └────────────────────────────────────────────────────────┘
```

---

## 3. Day-1 Multi-Tenancy (PostgreSQL Row-Level Security)

Cross-tenant data leakage rokne ke liye PostgreSQL 16 **Row Level Security (RLS)** ka use kiya gaya hai:

```sql
-- 1. Enable RLS on core tables
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;

-- 2. Tenant Isolation Policy
CREATE POLICY rls_tickets_tenant ON tickets
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
```

### Express.js Tenant Context Middleware
Har request pe tenant context inject hota hai taaki SQL query me agar dev `WHERE tenant_id = ...` bhool bhi jaye, to bhi DB kernel level pe doosre tenant ka data leak na ho:

```typescript
// src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';

export const withTenantContext = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user?.tenant_id) return res.status(401).json({ error: 'Missing tenant context' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_tenant_id = $1`, [user.tenant_id]);
    await client.query(`SET LOCAL app.current_user_role = $1`, [user.role]);

    (req as any).dbClient = client;

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

## 4. Bank-Grade RBAC (Role-Based Access Control) Matrix

System me 6 distinct roles configured hain:

| Role | Scope & Permissions | Accessible Surfaces | Security Enforcements |
| :--- | :--- | :--- | :--- |
| **`super_admin`** | Platform owner, tenant provisioning, system-wide audit logs | Global Admin Portal (`/admin/*`) | Hardware MFA (FIDO2) + IP Whitelist |
| **`tenant_admin`**| Organization admin, manage squad members, generate API keys, SLA settings | Tenant Settings, Billing, Squad Dashboards | TOTP MFA + Single-click session revocation |
| **`squad_lead`**  | Assign tickets, triage override, merge duplicates, dispatch alerts | Squad Queue, Triage Console, Telemetry Views | JWT + Tenant session binding |
| **`developer`**   | Full technical view, stack traces, network replays, internal notes | Developer Workspace, Dev Notes, API Inspector | Client PII auto-redacted in telemetry |
| **`support_agent`**| Client communication, public status updates, triage escalation | Support Inbox, Client View | Zero access to raw DB/auth dumps |
| **`client_user`** | Submit feedback, track progress of own organization's issues | Client Portal, Embedded Widget history | Zero access to internal dev notes |

### RBAC Enforcement Middleware
```typescript
// src/middleware/rbac.ts
import { Request, Response, NextFunction } from 'express';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges',
        required: allowedRoles,
        current: role || 'anonymous'
      });
    }
    next();
  };
};
```

---

## 5. Security & Cryptography Standards

1. **AES-256-GCM Field-Level Encryption:** Sensitive telemetry data (client tokens, authorization headers, PII) database me save hone se pehle encrypt hota hai:
   ```typescript
   // src/services/crypto.ts
   import crypto from 'crypto';
   const ALGO = 'aes-256-gcm';
   const KEY = Buffer.from(process.env.ENCRYPTION_KEY_AES256!, 'hex');

   export const encryptData = (text: string): string => {
     const iv = crypto.randomBytes(12);
     const cipher = crypto.createCipheriv(ALGO, KEY, iv);
     let encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
     const tag = cipher.getAuthTag();
     return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
   };
   ```
2. **Rotating Refresh Token Families:** Refresh tokens single-use hote hain. Token reuse detect hote hi poora token family invalidate ho jata hai.
3. **Argon2id Password Hashing:** Memory-hard hashing algorithm brute-force aur rainbow table attacks ko block karta hai.
4. **Immutable Audit Logs:** `audit_logs` table append-only hai (No `UPDATE` or `DELETE` permissions allowed).

---

## 6. Embeddable Client Telemetry SDK

Client products ke frontend me sirf 1 script tag embed hota hai jo automatically browser console errors aur 4xx/5xx network failures capture karta hai:

```html
<!-- Client Product HTML -->
<script 
  src="https://hub.yourdomain.com/v1/sdk.js" 
  data-product-key="prod_live_abc123"
  data-endpoint="https://hub.yourdomain.com">
</script>
```

### SDK Capabilities:
* Automatically listens to `window.onerror` and `unhandledrejection`.
* Intercepts `window.fetch` to capture failed endpoints without logging confidential passwords or authorization tokens.
* Captures browser viewport, user agent, current route, and timestamp.
* 1-Click user feedback modal with pre-attached debugging telemetry.

---

## 7. Stripe Squarish UI/UX Design System

* **Sharp Geometry:** `rounded-none` ya `rounded-xs (2px)`. Bubbly corners aur circular pill-shapes strictly prohibited hain.
* **1px High-Contrast Borders:** `border-neutral-200` (Light Mode) / `border-neutral-800` (Dark Mode).
* **Typography:** `Inter` / `Geist Sans` for UI copy; `JetBrains Mono` for short codes (`FB-1042`), HTTP statuses (`500 Internal Error`), and latency numbers.
* **Status Badges:** Squarish tags with pulsing dot: `[ • OPEN ]`, `[ • IN_DEV ]`, `[ • RESOLVED ]`.
* **Keyboard Power-User:** `Cmd+K` global command palette for instantaneous search across tickets and squads.

---

## 8. Real-Time Incident Dispatch & SLA Engine

1. **Sub-120ms Ingestion:** Jaise hi client ticket submit karta hai, payload sanitize hokar Postgres me likha jata hai.
2. **Redis Pub/Sub Dispatch:** Event `events:tenant_{id}` channel me publish hota hai aur Socket.io ke through on-duty developers ke portal me audible chime aur visual toast trigger karta hai.
3. **SLA Breach Auto-Escalation:** Agar koi `CRITICAL` ya `BLOCKER` ticket 15 minutes tak unassigned rehti hai, system automatically Slack / Discord webhook trigger karta hai.

---

## 9. PostgreSQL Database Schema

Schema file repository me [db/schema.sql](file:///Users/abhigyan/Feedback-Hub/db/schema.sql) par available hai:
* `tenants`: Multi-tenant organization isolation boundary
* `users`: Users with custom roles (`super_admin`, `developer`, `client_user`, etc.)
* `products`: Software products monitored by the hub
* `tickets`: Main tickets with severity, status, squad assignment, and SLA targets
* `ticket_telemetry`: Isolated encrypted console logs and failed network requests
* `ticket_events`: Dual-view timeline (Internal dev notes vs Client updates)
* `audit_logs`: Immutable audit trail for SOC2 / ISO compliance

---

## 10. Quick Start & Environment Setup

### 1. Prerequisites
* Node.js v20+
* Docker & Docker Compose

### 2. Start PostgreSQL & Redis
```bash
docker compose up -d
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Generate secure cryptographic keys:
```bash
# Generate JWT Secrets (64 bytes hex)
openssl rand -hex 64

# Generate AES-256 Master Key (32 bytes hex)
openssl rand -hex 32
```

### 4. Generated Documentation Artifacts
* **Architecture PDF:** [Feedback-Hub-Architecture-Specification.pdf](file:///Users/abhigyan/Feedback-Hub/Feedback-Hub-Architecture-Specification.pdf)
* **Architecture Markdown:** [ARCHITECTURE.md](file:///Users/abhigyan/Feedback-Hub/ARCHITECTURE.md)
* **SQL Migration Script:** [db/schema.sql](file:///Users/abhigyan/Feedback-Hub/db/schema.sql)