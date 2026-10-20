-- =========================================================================
-- V10__widen_public_id_for_custom_slug.sql: Allow custom slugs up to 64 chars
-- =========================================================================

ALTER TABLE pastes ALTER COLUMN public_id SET DATA TYPE VARCHAR(64);
