-- =========================================================================
-- V21: Public profile fields
--
-- Every column is nullable so existing accounts, and the native
-- UserRepository.insertIfAbsent provisioning path (which lists its columns
-- explicitly), remain valid without a backfill.
-- =========================================================================

ALTER TABLE users ADD COLUMN display_name VARCHAR(80);
ALTER TABLE users ADD COLUMN bio VARCHAR(500);
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN github_url VARCHAR(255);
ALTER TABLE users ADD COLUMN linkedin_url VARCHAR(255);
ALTER TABLE users ADD COLUMN x_url VARCHAR(255);

COMMENT ON COLUMN users.display_name IS 'Optional public display name; falls back to @username when null.';
COMMENT ON COLUMN users.bio IS 'Optional public biography, plain text only.';
COMMENT ON COLUMN users.avatar_url IS 'Optional public avatar image URL (http/https).';
COMMENT ON COLUMN users.github_url IS 'Optional normalized GitHub profile URL.';
COMMENT ON COLUMN users.linkedin_url IS 'Optional normalized LinkedIn profile URL.';
COMMENT ON COLUMN users.x_url IS 'Optional normalized X/Twitter profile URL.';
