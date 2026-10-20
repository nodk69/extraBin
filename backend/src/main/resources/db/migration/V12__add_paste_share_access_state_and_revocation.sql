-- =========================================================================
-- V12__add_paste_share_access_state_and_revocation.sql:
-- Granular Sharing Permissions, Tokenized Unlisted Pastes & Link Revocation
-- =========================================================================

-- 1. ADD COLUMNS FOR SHARING & REVOCATION
ALTER TABLE pastes ADD COLUMN share_access_state VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE pastes ADD COLUMN share_token_hash VARCHAR(64) NULL;
ALTER TABLE pastes ADD COLUMN link_revoked_at TIMESTAMP WITH TIME ZONE NULL;

-- 2. BACKFILL LEGACY UNLISTED RECORDS
-- Pre-migration unlisted pastes receive LEGACY_OPEN so their URLs continue working without a share token
UPDATE pastes
SET share_access_state = 'LEGACY_OPEN'
WHERE visibility = 'UNLISTED';

-- 3. STATE CONSTRAINTS ON PASTES TABLE
-- Check 1: Allowed enum values for share_access_state
ALTER TABLE pastes ADD CONSTRAINT chk_pastes_share_access_state
    CHECK (share_access_state IN ('NOT_APPLICABLE', 'LEGACY_OPEN', 'ACTIVE', 'REVOKED'));

-- Check 2: NOT_APPLICABLE requires non-unlisted visibility, no token hash, no revocation timestamp
ALTER TABLE pastes ADD CONSTRAINT chk_pastes_not_applicable_state
    CHECK (
        share_access_state <> 'NOT_APPLICABLE'
        OR (visibility <> 'UNLISTED' AND share_token_hash IS NULL AND link_revoked_at IS NULL)
    );

-- Check 3: LEGACY_OPEN requires UNLISTED visibility, no token hash, no revocation timestamp
ALTER TABLE pastes ADD CONSTRAINT chk_pastes_legacy_open_state
    CHECK (
        share_access_state <> 'LEGACY_OPEN'
        OR (visibility = 'UNLISTED' AND share_token_hash IS NULL AND link_revoked_at IS NULL)
    );

-- Check 4: ACTIVE requires UNLISTED visibility, valid 64-char hex SHA-256 token hash, and no revocation timestamp
ALTER TABLE pastes ADD CONSTRAINT chk_pastes_active_state
    CHECK (
        share_access_state <> 'ACTIVE'
        OR (visibility = 'UNLISTED' AND share_token_hash IS NOT NULL AND link_revoked_at IS NULL)
    );

-- Check 5: REVOKED requires revocation timestamp present and no active token hash
ALTER TABLE pastes ADD CONSTRAINT chk_pastes_revoked_state
    CHECK (
        share_access_state <> 'REVOKED'
        OR (link_revoked_at IS NOT NULL AND share_token_hash IS NULL)
    );

-- 4. INDEX ON SHARE TOKEN HASH FOR CONSTANT-TIME LOOKUPS
CREATE INDEX idx_pastes_share_token_hash ON pastes (share_token_hash);
