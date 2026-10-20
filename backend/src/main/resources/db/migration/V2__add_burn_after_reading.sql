-- =========================================================================
-- V2__add_burn_after_reading.sql: Add Burn After Reading capability to pastes
-- =========================================================================

ALTER TABLE pastes ADD COLUMN burn_after_reading BOOLEAN NOT NULL DEFAULT FALSE;
