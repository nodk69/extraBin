-- Developer follow graph. Both foreign keys cascade on account deletion; the unique
-- pair is the concurrency-safe duplicate-follow invariant.
CREATE TABLE user_follows (
    follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_user_follows PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT chk_user_follows_not_self CHECK (follower_id <> followed_id)
);

CREATE INDEX idx_user_follows_followed_created ON user_follows (followed_id, created_at DESC, follower_id DESC);
CREATE INDEX idx_user_follows_follower_created ON user_follows (follower_id, created_at DESC, followed_id DESC);

-- Existing notification rows remain valid. Null paste_id is used for profile-only events.
ALTER TABLE notifications ALTER COLUMN paste_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN notify_on_follows BOOLEAN NOT NULL DEFAULT TRUE;
