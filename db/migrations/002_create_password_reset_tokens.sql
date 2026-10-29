-- ==============================================================================
-- FEEDBACK-HUB: MIGRATION 002 - PASSWORD RESET TOKENS TABLE
-- Purpose: Secure single-use password reset token storage, expiration enforcement,
--          tenant isolation, and PostgreSQL Row-Level Security (RLS).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

-- Indexes for performance and lookup speed
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_tenant ON password_reset_tokens(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active_expiry ON password_reset_tokens(expires_at) WHERE is_used = FALSE;

-- Row Level Security (RLS) enforcement
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_password_reset_tokens_tenant ON password_reset_tokens
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
