-- ==============================================================================
-- FEEDBACK-HUB: MIGRATION 001 - REFRESH TOKENS TABLE
-- Purpose: Multi-session refresh token persistence, family-based compromise detection,
--          single-use rotation lineage, and PostgreSQL Row-Level Security (RLS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    family_id UUID NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replaced_by_token_hash VARCHAR(64)
);

-- Indexes for performance and security lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_tenant ON refresh_tokens(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_expiry ON refresh_tokens(expires_at) WHERE is_revoked = FALSE;

-- Row Level Security (RLS) enforcement
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_refresh_tokens_tenant ON refresh_tokens
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
