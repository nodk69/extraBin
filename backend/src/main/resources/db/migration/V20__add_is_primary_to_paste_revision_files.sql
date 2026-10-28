-- =========================================================================
-- V20__add_is_primary_to_paste_revision_files.sql
-- Explicitly track primary file identity in workspace snapshots
-- =========================================================================

ALTER TABLE paste_revision_files 
ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure that for any existing snapshot rows, the primary file (sort_order = 0) is flagged is_primary = true
UPDATE paste_revision_files 
SET is_primary = TRUE 
WHERE sort_order = 0;

CREATE INDEX idx_paste_revision_files_rev_primary ON paste_revision_files (revision_id, is_primary);
