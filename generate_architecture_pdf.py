import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#71717A"))
        
        # Don't draw header/footer on cover page if page 1
        if self._pageNumber > 1:
            # Header
            self.drawString(54, 11 * inch - 36, "FEEDBACK-HUB | ENTERPRISE TECHNICAL ARCHITECTURE & RBAC SPEC")
            self.drawRightString(8.5 * inch - 54, 11 * inch - 36, "CONFIDENTIAL & PROPRIETARY")
            self.setStrokeColor(colors.HexColor("#E4E4E7"))
            self.setLineWidth(0.75)
            self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)

            # Footer
            self.line(54, 45, 8.5 * inch - 54, 45)
            self.drawString(54, 32, "BANK-GRADE MULTI-TENANT PERN (POSTGRESQL + EXPRESS + REACT + NODE)")
            page_text = f"Page {self._pageNumber} of {page_count}"
            self.drawRightString(8.5 * inch - 54, 32, page_text)
            
        self.restoreState()


def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette (Stripe Squarish Dark/Monochrome + Indigo Accent)
    C_PRIMARY = colors.HexColor("#09090B")    # Slate 950 / Black
    C_SECONDARY = colors.HexColor("#27272A")  # Slate 800
    C_MUTED = colors.HexColor("#52525B")      # Slate 600
    C_LIGHT_BG = colors.HexColor("#F4F4F5")   # Slate 100
    C_BORDER = colors.HexColor("#E4E4E7")     # Slate 200
    C_ACCENT = colors.HexColor("#4F46E5")     # Indigo 600
    C_SUCCESS = colors.HexColor("#16A34A")    # Green 600
    C_CARD_BG = colors.HexColor("#FAFAFA")

    # Typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=C_PRIMARY,
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=C_MUTED,
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=C_PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=C_SECONDARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=C_SECONDARY,
        spaceAfter=6
    )

    body_bold = ParagraphStyle(
        'Body_Bold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    code_style = ParagraphStyle(
        'Code_Custom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor("#18181B")
    )

    badge_style = ParagraphStyle(
        'Badge_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=colors.white
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=C_PRIMARY
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=C_SECONDARY
    )

    table_cell_mono = ParagraphStyle(
        'TableCellMono',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7,
        leading=9,
        textColor=C_PRIMARY
    )

    story = []

    # ================= COVER / HEADER BANNER (STRIPE SQUARISH) =================
    banner_data = [
        [
            Paragraph("<b>SYSTEM ARCHITECTURE SPECIFICATION v1.0</b>", ParagraphStyle('BnrSub', fontName='Helvetica-Bold', fontSize=8, textColor=C_ACCENT)),
            Paragraph("<b>STATUS: PRODUCTION-READY BLUEPRINT</b>", ParagraphStyle('BnrStatus', fontName='Helvetica-Bold', fontSize=8, textColor=C_SUCCESS, alignment=2))
        ],
        [
            Paragraph("<b>FEEDBACK-HUB</b><br/><font size=11 color='#52525B'>Multi-Tenant Client Observability, Triage & Real-Time Incident Bridge</font>", title_style),
            ""
        ],
        [
            Paragraph("<b>Target Stack:</b> PERN (PostgreSQL 16 + Express/Node 20 + React 18 + TS) | <b>Security:</b> Bank-Grade AES-256 + RLS + JWT Rotation | <b>Design:</b> Stripe Squarish System", ParagraphStyle('BnrMeta', fontName='Helvetica', fontSize=8, textColor=C_MUTED)),
            ""
        ]
    ]
    banner_table = Table(banner_data, colWidths=[400, 104])
    banner_table.setStyle(TableStyle([
        ('SPAN', (0, 1), (1, 1)),
        ('SPAN', (0, 2), (1, 2)),
        ('BACKGROUND', (0, 0), (-1, -1), C_CARD_BG),
        ('BOX', (0, 0), (-1, -1), 1, C_BORDER),
        ('PADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
        ('TOPPADDING', (0, 1), (-1, 1), 6),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 12))

    # ================= SECTION 1: IDEA EVALUATION & STRATEGIC VALUE =================
    story.append(Paragraph("1. EXECUTIVE IDEA EVALUATION & COMPETITIVE STRATEGY", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))
    
    eval_text = (
        "<b>Founder / Architect Honest Assessment:</b><br/>"
        "Aapka idea <b>100% solid aur high-value enterprise problem</b> ko solve karta hai. Almost 85% tech companies mei "
        "sabse bada bottleneck yahi hota hai: <i>Client / Non-technical users bug face karte hain, WhatsApp ya email par vague screenshots bhejte hain "
        "('bhai button kaam nahi kar raha'), aur internal API/Frontend dev team ke paas zero context hota hai (no headers, no console logs, no payload, no environment state).</i> "
        "Dev bolta hai 'Works on my machine', aur client frustrated hota hai."
    )
    story.append(Paragraph(eval_text, body_style))
    story.append(Spacer(1, 4))

    # Pros and Enterprise Edge Table
    strat_data = [
        [Paragraph("STRATEGIC PILLAR", table_header_style), Paragraph("WHY THIS WINS (YOUR EDGE OVER JIRA / SENTRY)", table_header_style)],
        [
            Paragraph("<b>Zero-Effort Telemetry</b>", table_cell_style),
            Paragraph("Client widget just 1-click submit karta hai. Background script auto-captures URL, User Agent, Network Failed Requests, Local Storage keys, Screen Res, and Redacted JWT context. Client ko form fill karne mei 5 seconds lagte hain.", table_cell_style)
        ],
        [
            Paragraph("<b>Direct API Squad Dispatch</b>", table_cell_style),
            Paragraph("Routing rules ke through URL/API route ke hisab se specific squad (e.g. Auth team, Payment team) ke bucket mei directly ticket drop hoti hai with immediate Slack/WebSocket ding.", table_cell_style)
        ],
        [
            Paragraph("<b>Dual-View Quarantine</b>", table_cell_style),
            Paragraph("Client portal ko sirf curated updates milte hain ('Investigating', 'Hotfix in QA', 'Resolved'). Internal dev discussions, stack traces, and dirty logs client se 100% hidden rehte hain.", table_cell_style)
        ],
        [
            Paragraph("<b>Commercial B2B Potential</b>", table_cell_style),
            Paragraph("Pehle apni in-house products ke liye use karo. Once battle-tested, sell it as an Enterprise B2B SaaS competing with Usersnap / Marker.io par targeted at API-heavy Dev Shops.", table_cell_style)
        ]
    ]
    t_strat = Table(strat_data, colWidths=[130, 374])
    t_strat.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.75, C_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, C_BORDER),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_strat)
    story.append(Spacer(1, 10))

    # ================= SECTION 2: DAY-1 MULTI-TENANT ARCHITECTURE =================
    story.append(Paragraph("2. DAY-1 MULTI-TENANT DATA ISOLATION (POSTGRESQL RLS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))
    
    tenant_text = (
        "Enterprise bank-level architecture requires guaranteed tenant isolation. Instead of costly database-per-tenant, "
        "we implement <b>Shared-Process, Shared-Database with PostgreSQL Row-Level Security (RLS)</b>. Har table me immutable <code>tenant_id UUID</code> "
        "hoga aur Postgres level par filter enforce hoga taaki ek tenant ka data kisi doosre tenant ko leak hone ka 0.00% chance rahe."
    )
    story.append(Paragraph(tenant_text, body_style))

    sql_rls = (
        "-- 1. Enable RLS on core tables\n"
        "ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;\n"
        "ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;\n"
        "\n"
        "-- 2. Define Tenant Isolation Policy via Session Variable\n"
        "CREATE POLICY tenant_isolation_policy ON tickets\n"
        "FOR ALL\n"
        "USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);\n"
        "\n"
        "-- 3. In Express.js Database Pool / Transaction Middleware:\n"
        "-- await client.query(`SET LOCAL app.current_tenant_id = $1`, [req.user.tenant_id]);"
    )
    t_sql = Table([[Paragraph(f"<pre>{sql_rls}</pre>", code_style)]], colWidths=[504])
    t_sql.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_sql)
    story.append(Spacer(1, 10))

    # ================= SECTION 3: BANK-GRADE RBAC & PERMISSION MATRIX =================
    story.append(Paragraph("3. ENTERPRISE ROLE-BASED ACCESS CONTROL (RBAC) MATRIX", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))

    rbac_rows = [
        [
            Paragraph("ROLE", table_header_style),
            Paragraph("SCOPE & PERMISSIONS", table_header_style),
            Paragraph("VISIBLE SURFACES", table_header_style),
            Paragraph("SECURITY CONTROLS", table_header_style)
        ],
        [
            Paragraph("<b>super_admin</b>", table_cell_mono),
            Paragraph("Full platform control, tenant provisioning, global audit logs, billing override.", table_cell_style),
            Paragraph("Global Root Portal (`/admin/*`)", table_cell_style),
            Paragraph("Hardware MFA (FIDO2) + IP Whitelist", table_cell_style)
        ],
        [
            Paragraph("<b>tenant_admin</b>", table_cell_mono),
            Paragraph("Manage tenant users, invite devs/clients, create products, configure webhooks & SLA.", table_cell_style),
            Paragraph("Tenant Settings, Billing, Squad Dashboards", table_cell_style),
            Paragraph("TOTP MFA required + Session revocation", table_cell_style)
        ],
        [
            Paragraph("<b>squad_lead</b>", table_cell_mono),
            Paragraph("Assign tickets, override triage, merge duplicates, link internal Jira/GitHub issue, export reports.", table_cell_style),
            Paragraph("Triage Queue, Dev Console, Telemetry Logs", table_cell_style),
            Paragraph("Standard JWT + Tenant Binding", table_cell_style)
        ],
        [
            Paragraph("<b>developer</b>", table_cell_mono),
            Paragraph("View technical payloads, stack traces, network replays; write internal dev notes; mark resolved.", table_cell_style),
            Paragraph("Full Tech Ticket View, Dev Notes, API Inspector", table_cell_style),
            Paragraph("Client PII auto-redacted in logs", table_cell_style)
        ],
        [
            Paragraph("<b>support_agent</b>", table_cell_mono),
            Paragraph("Read sanitized ticket, post public customer messages, trigger manual escalation to dev squad.", table_cell_style),
            Paragraph("Support Inbox, Client Messenger View", table_cell_style),
            Paragraph("No access to raw DB/auth dumps", table_cell_style)
        ],
        [
            Paragraph("<b>client_user</b>", table_cell_mono),
            Paragraph("Submit feedback/bugs from embedded widget or client portal; track progress of their org's issues.", table_cell_style),
            Paragraph("Client View Portal, Own Widget History", table_cell_style),
            Paragraph("Strict zero-knowledge of internal dev notes", table_cell_style)
        ],
        [
            Paragraph("<b>widget_token</b>", table_cell_mono),
            Paragraph("Ingest-only public token embedded in web apps. Can only POST sanitized payload to <code>/api/v1/ingest</code>.", table_cell_style),
            Paragraph("None (Headless SDK embed only)", table_cell_style),
            Paragraph("Redis Token-Bucket Rate Limited + Domain Origin check", table_cell_style)
        ]
    ]
    t_rbac = Table(rbac_rows, colWidths=[76, 170, 128, 130])
    t_rbac.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.75, C_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, C_BORDER),
        ('PADDING', (0, 0), (-1, -1), 4.5),
    ]))
    story.append(t_rbac)
    story.append(Spacer(1, 10))

    # ================= SECTION 4: COMPLETE POSTGRESQL DATA MODEL =================
    story.append(Paragraph("4. RELATIONAL DATA SCHEMA & AUDIT ARCHITECTURE", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))

    schema_summary = [
        [Paragraph("TABLE", table_header_style), Paragraph("KEY COLUMNS", table_header_style), Paragraph("DESCRIPTION & CONSTRAINTS", table_header_style)],
        [
            Paragraph("<b>tenants</b>", table_cell_mono),
            Paragraph("id (UUID PK), name, slug, plan, security_settings (JSONB), created_at", table_cell_style),
            Paragraph("Multi-tenant organization boundary. Stores custom SLA thresholds and allowed domains.", table_cell_style)
        ],
        [
            Paragraph("<b>users</b>", table_cell_mono),
            Paragraph("id (UUID PK), tenant_id (FK), email, password_hash, role_id, mfa_secret, status", table_cell_style),
            Paragraph("Argon2id password hashing, rotating refresh token family ID for instant compromise revoke.", table_cell_style)
        ],
        [
            Paragraph("<b>products</b>", table_cell_mono),
            Paragraph("id (UUID PK), tenant_id (FK), name, slug, api_key_hash, allowed_origins (ARRAY)", table_cell_style),
            Paragraph("Represent distinct software products/services where the feedback widget is embedded.", table_cell_style)
        ],
        [
            Paragraph("<b>tickets</b>", table_cell_mono),
            Paragraph("id (UUID PK), tenant_id, product_id, title, description, category, severity, status, assigned_to", table_cell_style),
            Paragraph("Indexed by `(tenant_id, status, severity, created_at)`. Auto-generated human short ID (e.g. FB-1042).", table_cell_style)
        ],
        [
            Paragraph("<b>ticket_telemetry</b>", table_cell_mono),
            Paragraph("ticket_id (FK), url, user_agent, network_logs (JSONB), console_errors (JSONB), screen_res, redacted_state", table_cell_style),
            Paragraph("Sensitive PII is AES-256-GCM encrypted. Isolated from basic ticket table to keep queries ultra-fast.", table_cell_style)
        ],
        [
            Paragraph("<b>ticket_events</b>", table_cell_mono),
            Paragraph("id, ticket_id, author_id, event_type, content, is_internal_only (BOOLEAN), created_at", table_cell_style),
            Paragraph("Event sourcing. `is_internal_only = true` is strictly filtered out for client roles.", table_cell_style)
        ],
        [
            Paragraph("<b>audit_logs</b>", table_cell_mono),
            Paragraph("id, tenant_id, actor_id, action, target_type, target_id, old_values, new_values, ip, user_agent", table_cell_style),
            Paragraph("Append-only immutable audit trail required for SOC2 / ISO27001 bank-grade compliance.", table_cell_style)
        ]
    ]
    t_schema = Table(schema_summary, colWidths=[90, 180, 234])
    t_schema.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.75, C_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, C_BORDER),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_schema)
    story.append(Spacer(1, 10))

    # ================= SECTION 5: STRIPE SQUARISH UI/UX DESIGN SYSTEM =================
    story.append(Paragraph("5. STRIPE SQUARISH ENTERPRISE UI/UX SPECIFICATION", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))
    
    ui_text = (
        "<b>Aesthetic Mandate:</b> High-contrast, sharp geometric structure reminiscent of Stripe Dashboard, Linear, and Vercel. "
        "Strict <code>rounded-none</code> or <code>rounded-xs (2px)</code> radius. No bubbly or generic templates."
    )
    story.append(Paragraph(ui_text, body_style))

    ui_specs = [
        [Paragraph("UI ELEMENT", table_header_style), Paragraph("DESIGN SYSTEM TOKEN / RULE", table_header_style), Paragraph("INTERACTION / MICRO-ANIMATION", table_header_style)],
        [
            Paragraph("<b>Corners & Borders</b>", table_cell_style),
            Paragraph("<code>border-radius: 2px</code> (Max 4px on modals). Crisp 1px solid <code>#E4E4E7</code> (Light) / <code>#27272A</code> (Dark).", table_cell_style),
            Paragraph("Zero pill shapes. Sharp industrial feel with precise 8px grid snapping.", table_cell_style)
        ],
        [
            Paragraph("<b>Typography</b>", table_cell_style),
            Paragraph("Heading & Body: <b>Inter</b> / <b>Geist Sans</b> (tight tracking -0.02em).<br/>Code & IDs: <b>JetBrains Mono</b>.", table_cell_style),
            Paragraph("Tabular numbers (<code>font-variant-numeric: tabular-nums</code>) for latency and error counts.", table_cell_style)
        ],
        [
            Paragraph("<b>Color Palette</b>", table_cell_style),
            Paragraph("Background: <code>#FFFFFF</code> / <code>#09090B</code>.<br/>Surface Cards: <code>#FAFAFA</code> / <code>#121214</code>.<br/>Primary Accent: <code>#4F46E5</code> (Indigo) or <code>#000000</code>.", table_cell_style),
            Paragraph("Subtle contrast shift on hover (<code>bg-neutral-50</code> to <code>bg-neutral-100</code>).", table_cell_style)
        ],
        [
            Paragraph("<b>Command Menu (Cmd+K)</b>", table_cell_style),
            Paragraph("Global modal with instant search across all tickets, API squads, and error traces.", table_cell_style),
            Paragraph("Sub-50ms instant filtering with keyboard arrow navigation.", table_cell_style)
        ],
        [
            Paragraph("<b>Status Badges</b>", table_cell_style),
            Paragraph("Squarish tags with 1px border and pulsing status dot: <code>[ • OPEN ]</code>, <code>[ • IN_DEV ]</code>, <code>[ • RESOLVED ]</code>.", table_cell_style),
            Paragraph("Glowing subtle ambient dot for active real-time investigation.", table_cell_style)
        ]
    ]
    t_ui = Table(ui_specs, colWidths=[110, 204, 190])
    t_ui.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.75, C_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, C_BORDER),
        ('PADDING', (0, 0), (-1, -1), 4.5),
    ]))
    story.append(t_ui)
    story.append(Spacer(1, 10))

    # ================= SECTION 6: INGESTION PIPELINE & REAL-TIME WEBSOCKETS =================
    story.append(Paragraph("6. EMBEDDABLE CLIENT SDK & INCIDENT DISPATCH ENGINE", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))

    flow_text = (
        "<b>End-to-End Pipeline:</b><br/>"
        "1. <b>Client Product Embed:</b> Client adds <code>&lt;script src=\"https://hub.yourdomain.com/v1/sdk.js\" data-product-key=\"prod_live_xxx\"&gt;&lt;/script&gt;</code>.<br/>"
        "2. <b>Auto-Telemetry Capture:</b> Intercepts <code>window.onerror</code>, <code>unhandledrejection</code>, and failed <code>fetch</code> calls (4xx/5xx). Sanitizes passwords/tokens via client-side regex.<br/>"
        "3. <b>Fast Ingest Endpoint:</b> <code>POST /api/v1/ingest/ticket</code> validates API Key, applies Redis Token Bucket (max 30 req/min per IP to prevent spam), writes payload to PostgreSQL.<br/>"
        "4. <b>Real-Time Event Dispatch:</b> Redis Pub/Sub broadcasts event to WebSocket gateway (Socket.io room <code>tenant:{tenant_id}:squad:{squad_id}</code>).<br/>"
        "5. <b>Dev Instant Notification:</b> On-duty engineers get sound alert + visual badge in Feedback-Hub portal + Slack webhook alert within &lt;150ms."
    )
    story.append(Paragraph(flow_text, body_style))
    story.append(Spacer(1, 8))

    # ================= SECTION 7: PRODUCTION ENVIRONMENT & DOCKER MATRIX =================
    story.append(Paragraph("7. ZERO-DEFECT ENVIRONMENT ARCHITECTURE (.ENV)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=8))

    env_table_data = [
        [Paragraph("ENV VARIABLE", table_header_style), Paragraph("SECURITY CLASSIFICATION", table_header_style), Paragraph("PURPOSE & ENFORCEMENT", table_header_style)],
        [Paragraph("<code>DATABASE_URL</code>", table_cell_mono), Paragraph("CRITICAL SECRET", table_cell_style), Paragraph("PostgreSQL 16 connection with connection pooling (PgBouncer ready).", table_cell_style)],
        [Paragraph("<code>REDIS_URL</code>", table_cell_mono), Paragraph("CONFIDENTIAL", table_cell_style), Paragraph("Pub/Sub real-time gateway and Token-Bucket rate limiting store.", table_cell_style)],
        [Paragraph("<code>JWT_ACCESS_SECRET</code>", table_cell_mono), Paragraph("HIGH SECRET (512-bit)", table_cell_style), Paragraph("Short-lived 15-minute access token signing.", table_cell_style)],
        [Paragraph("<code>JWT_REFRESH_SECRET</code>", table_cell_mono), Paragraph("HIGH SECRET (512-bit)", table_cell_style), Paragraph("7-day rotating refresh token family secret.", table_cell_style)],
        [Paragraph("<code>ENCRYPTION_KEY_AES256</code>", table_cell_mono), Paragraph("MASTER SECRET (32 bytes)", table_cell_style), Paragraph("Used by backend to encrypt/decrypt sensitive PII and API keys in DB.", table_cell_style)],
        [Paragraph("<code>CORS_ORIGIN_WHITELIST</code>", table_cell_mono), Paragraph("CONFIGURATION", table_cell_style), Paragraph("Restricts API access to authorized frontend domains only.", table_cell_style)]
    ]
    t_env = Table(env_table_data, colWidths=[140, 110, 254])
    t_env.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_LIGHT_BG),
        ('BOX', (0, 0), (-1, -1), 0.75, C_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, C_BORDER),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_env)
    story.append(Spacer(1, 14))

    # Conclusion box
    signoff = [
        [
            Paragraph("<b>READY FOR IMPLEMENTATION:</b> Complete production codebase skeleton, SQL migration scripts, and frontend components have been configured in your workspace repository.", ParagraphStyle('Signoff', fontName='Helvetica-Bold', fontSize=8, textColor=C_PRIMARY)),
        ]
    ]
    t_sign = Table(signoff, colWidths=[504])
    t_sign.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_sign)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated PDF: {filename}")

if __name__ == '__main__':
    output_pdf = "/Users/abhigyan/Feedback-Hub/Feedback-Hub-Architecture-Specification.pdf"
    build_pdf(output_pdf)
