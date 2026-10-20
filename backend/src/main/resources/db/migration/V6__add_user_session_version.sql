-- =========================================================================
-- V6__add_user_session_version.sql: Add Session Version for Instant Revocation (SEC-11)
-- =========================================================================

ALTER TABLE users ADD COLUMN session_version BIGINT NOT NULL DEFAULT 1;
