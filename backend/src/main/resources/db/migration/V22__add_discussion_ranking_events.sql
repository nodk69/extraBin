ALTER TABLE paste_activity_events DROP CONSTRAINT chk_activity_event_type;
ALTER TABLE paste_activity_events ADD CONSTRAINT chk_activity_event_type
    CHECK (event_type IN ('VIEW', 'STAR', 'UPVOTE', 'COMMENT', 'REPLY'));
ALTER TABLE paste_activity_events ADD COLUMN source_comment_id BIGINT;
ALTER TABLE paste_activity_events ADD COLUMN source_reply_id BIGINT;
ALTER TABLE paste_activity_events ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE paste_activity_events ADD COLUMN view_bucket BIGINT;

-- Retain deleted discussion references until the existing 30-day purge so recreation cannot reset the identity cap.
ALTER TABLE paste_activity_events ADD CONSTRAINT chk_activity_discussion_source CHECK (
    (event_type IN ('VIEW', 'STAR', 'UPVOTE') AND source_comment_id IS NULL AND source_reply_id IS NULL)
    OR (event_type = 'COMMENT' AND user_id IS NOT NULL
        AND ((source_comment_id IS NOT NULL AND source_reply_id IS NULL)
          OR (source_comment_id IS NULL AND source_reply_id IS NOT NULL)))
    OR (event_type = 'REPLY' AND user_id IS NOT NULL AND source_comment_id IS NULL AND source_reply_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_activity_comment_source ON paste_activity_events(source_comment_id) WHERE source_comment_id IS NOT NULL;
CREATE UNIQUE INDEX uq_activity_reply_source ON paste_activity_events(source_reply_id) WHERE source_reply_id IS NOT NULL;
CREATE UNIQUE INDEX uq_activity_user_view_bucket ON paste_activity_events(paste_id, user_id, view_bucket)
    WHERE event_type = 'VIEW' AND user_id IS NOT NULL AND view_bucket IS NOT NULL;
CREATE UNIQUE INDEX uq_activity_visitor_view_bucket ON paste_activity_events(paste_id, client_ip_hash, view_bucket)
    WHERE event_type = 'VIEW' AND client_ip_hash IS NOT NULL AND view_bucket IS NOT NULL;
