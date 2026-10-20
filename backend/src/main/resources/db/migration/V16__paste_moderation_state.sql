-- =========================================================================
-- V16__paste_moderation_state.sql: moderation lifecycle state for pastes
-- Discovery Increment 1 (ADR: shared eligibility predicate + moderation policy)
-- =========================================================================

ALTER TABLE pastes ADD COLUMN moderation_state VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE pastes ADD CONSTRAINT chk_pastes_moderation_state
    CHECK (moderation_state IN ('ACTIVE', 'HIDDEN'));
