-- =========================================================================
-- V11__add_encrypted_pastes.sql: Add End-to-End Encryption Support
-- =========================================================================

-- 1. ALTER PASTES TABLE
ALTER TABLE pastes ADD COLUMN encryption_mode VARCHAR(16) NULL;
ALTER TABLE pastes ADD COLUMN kdf_salt BYTEA NULL;
ALTER TABLE pastes ADD COLUMN kdf_iterations INTEGER NULL;
ALTER TABLE pastes ADD COLUMN wrapped_key BYTEA NULL;
ALTER TABLE pastes ALTER COLUMN content DROP NOT NULL;

-- 2. ALTER PASTE_FILES TABLE
ALTER TABLE paste_files ADD COLUMN ciphertext BYTEA NULL;
ALTER TABLE paste_files ADD COLUMN nonce BYTEA NULL;
ALTER TABLE paste_files ADD COLUMN auth_tag BYTEA NULL;
ALTER TABLE paste_files ADD COLUMN ciphertext_sha256 BYTEA NULL;
ALTER TABLE paste_files ALTER COLUMN content DROP NOT NULL;

-- 3. CONSTRAINTS ON PASTES
ALTER TABLE pastes ADD CONSTRAINT chk_pastes_encryption_mode
    CHECK (encryption_mode IS NULL OR encryption_mode IN ('LINK', 'PASSPHRASE'));

ALTER TABLE pastes ADD CONSTRAINT chk_pastes_kdf_params
    CHECK (encryption_mode IS NULL OR (kdf_salt IS NOT NULL AND kdf_iterations IS NOT NULL));

ALTER TABLE pastes ADD CONSTRAINT chk_pastes_wrapped_key
    CHECK (encryption_mode <> 'PASSPHRASE' OR wrapped_key IS NULL);

-- 4. RESILIENT CONSTRAINTS ON PASTE_FILES
ALTER TABLE paste_files ADD CONSTRAINT chk_paste_files_mutual_exclusion
    CHECK (content IS NULL OR ciphertext IS NULL);

ALTER TABLE paste_files ADD CONSTRAINT chk_paste_files_payload
    CHECK (
        (ciphertext IS NULL)
        OR
        (ciphertext IS NOT NULL AND nonce IS NOT NULL AND auth_tag IS NOT NULL AND ciphertext_sha256 IS NOT NULL)
    );

-- 5. PARTIAL INDEX
CREATE INDEX idx_pastes_encryption_mode ON pastes (encryption_mode);
