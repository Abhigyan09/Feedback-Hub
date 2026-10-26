-- ==============================================================================
-- FEEDBACK-HUB: BANK-GRADE MULTI-TENANT POSTGRESQL 16 SCHEMA
-- Isolation: Row Level Security (RLS) + Session Variable Binding
-- Optimization: Composite B-Tree Indexes & JSONB GIN Indexes
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS FOR STRICT TYPE SAFETY
CREATE TYPE user_role AS ENUM (
    'super_admin',
    'tenant_admin',
    'squad_lead',
    'developer',
    'support_agent',
    'client_user'
);

CREATE TYPE ticket_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'BLOCKER');
CREATE TYPE ticket_status AS ENUM ('OPEN', 'TRIAGED', 'IN_DEV', 'IN_QA', 'RESOLVED', 'CLOSED');
CREATE TYPE ticket_category AS ENUM ('BUG', 'API_FAILURE', 'UI_GLITCH', 'FEATURE_REQUEST', 'PERFORMANCE');

-- 2. TENANTS TABLE (Organization Isolation Boundary)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'ENTERPRISE',
    is_active BOOLEAN DEFAULT TRUE,
    allowed_domains TEXT[] DEFAULT '{}',
    security_settings JSONB DEFAULT '{
        "mfa_enforced": true,
        "session_timeout_minutes": 60,
        "ip_whitelist": []
    }'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'client_user',
    is_active BOOLEAN DEFAULT TRUE,
    mfa_secret_encrypted TEXT,
    refresh_token_family_id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_email UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role);

-- 4. PRODUCTS / REPOSITORIES (The software products being monitored)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    environment VARCHAR(50) DEFAULT 'production',
    webhook_url TEXT,
    webhook_secret_encrypted TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_product_slug UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_products_tenant ON products(tenant_id);

-- 5. TICKETS (Primary Feedback & Incident Table)
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    short_code VARCHAR(30) NOT NULL, -- e.g. FB-1049
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    category ticket_category DEFAULT 'BUG',
    severity ticket_severity DEFAULT 'MEDIUM',
    status ticket_status DEFAULT 'OPEN',
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_email VARCHAR(255),
    assigned_squad VARCHAR(100) DEFAULT 'CORE_API',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    sla_due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tenant_short_code UNIQUE (tenant_id, short_code)
);
CREATE INDEX idx_tickets_tenant_status ON tickets(tenant_id, status, severity, created_at DESC);
CREATE INDEX idx_tickets_product ON tickets(tenant_id, product_id);

-- 6. TICKET TELEMETRY & ERROR PAYLOAD (Isolated for Performance & Encryption)
CREATE TABLE ticket_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    page_url TEXT,
    app_version VARCHAR(50),
    user_agent TEXT,
    viewport_dimensions VARCHAR(50),
    console_logs JSONB DEFAULT '[]'::JSONB,
    network_errors JSONB DEFAULT '[]'::JSONB,
    encrypted_sensitive_data TEXT, -- AES-256-GCM Encrypted (headers, tokens, PII)
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_telemetry_ticket ON ticket_telemetry(ticket_id);

-- 7. TICKET TIMELINE & EVENTS (Dual-View: Internal Dev Notes vs Client Updates)
CREATE TABLE ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'STATUS_CHANGE', 'DEV_NOTE', 'CLIENT_REPLY', 'ASSIGNED'
    content TEXT NOT NULL,
    is_internal_only BOOLEAN DEFAULT FALSE, -- CRITICAL: When true, hidden from client_user
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_ticket ON ticket_events(ticket_id, created_at ASC);

-- 8. AUDIT LOGS (Immutable Bank-Grade Trail for Compliance & Security)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- e.g. 'TICKET_STATUS_UPDATED', 'API_KEY_ROTATED'
    entity_name VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, timestamp DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Dynamic Tenant Context Check
CREATE POLICY rls_tickets_tenant ON tickets
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

CREATE POLICY rls_telemetry_tenant ON ticket_telemetry
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

CREATE POLICY rls_events_tenant ON ticket_events
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
        AND (
            is_internal_only = FALSE 
            OR current_setting('app.current_user_role', true) IN ('super_admin', 'tenant_admin', 'squad_lead', 'developer', 'support_agent')
        )
    );

CREATE POLICY rls_products_tenant ON products
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

CREATE POLICY rls_audit_tenant ON audit_logs
    FOR SELECT
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
