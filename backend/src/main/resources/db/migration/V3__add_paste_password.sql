-- =========================================================================
-- V3__add_paste_password.sql: Add password protection capability to pastes
-- =========================================================================

ALTER TABLE pastes ADD COLUMN password_hash VARCHAR(255);
