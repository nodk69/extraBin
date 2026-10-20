-- 5. Add composite index on (visibility, language, created_at DESC) for fast filtered discovery feeds (SEC-14)
CREATE INDEX IF NOT EXISTS idx_pastes_visibility_lang_created ON pastes (visibility, language, created_at DESC);
