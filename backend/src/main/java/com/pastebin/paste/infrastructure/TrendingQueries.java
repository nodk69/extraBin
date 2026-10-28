package com.pastebin.paste.infrastructure;

public final class TrendingQueries {
    private TrendingQueries() {}

    public static final String RANKED = """
        WITH eligible AS (
            SELECT p.id, p.user_id, p.created_at FROM pastes p
            WHERE
        """ + PasteQueries.ELIGIBLE_PUBLIC_SQL_PREDICATE + """
            AND (CAST(:language AS text) IS NULL OR p.language = CAST(:language AS text))
        ), identities AS (
            SELECT e.*, ROW_NUMBER() OVER (
                PARTITION BY e.paste_id, e.event_type, e.user_id, e.client_ip_hash
                ORDER BY e.created_at, e.id
            ) AS identity_rank
            FROM paste_activity_events e JOIN eligible p ON p.id = e.paste_id
            WHERE e.created_at >= :windowStart AND e.created_at <= :now
                AND (e.user_id IS NULL OR p.user_id IS DISTINCT FROM e.user_id)
        ), unique_events AS (
            SELECT e.*, ROW_NUMBER() OVER (
                PARTITION BY e.paste_id, e.event_type, (e.user_id IS NULL)
                ORDER BY e.created_at, e.id
            ) AS visitor_rank
            FROM identities e WHERE e.identity_rank = 1
        ), contributions AS (
            SELECT e.paste_id,
                (CASE e.event_type WHEN 'VIEW' THEN :viewWeight WHEN 'UPVOTE' THEN :upvoteWeight
                    WHEN 'STAR' THEN :starWeight WHEN 'COMMENT' THEN :commentWeight
                    WHEN 'REPLY' THEN :replyWeight ELSE 0 END)
                * POWER(2.0, -EXTRACT(EPOCH FROM (CAST(:now AS timestamptz) - e.created_at)) / :halfLife) AS contribution
            FROM unique_events e
            WHERE e.active AND (e.user_id IS NOT NULL OR e.visitor_rank <= :anonymousCap)
                AND (
                    e.event_type = 'VIEW'
                    OR (e.event_type = 'STAR' AND EXISTS (
                        SELECT 1 FROM paste_stars s WHERE s.paste_id = e.paste_id AND s.user_id = e.user_id))
                    OR (e.event_type = 'UPVOTE' AND EXISTS (
                        SELECT 1 FROM paste_votes v WHERE v.paste_id = e.paste_id AND v.vote_type = 'UP'
                            AND ((e.user_id IS NOT NULL AND v.user_id = e.user_id)
                              OR (e.client_ip_hash IS NOT NULL AND v.client_ip_hash = e.client_ip_hash))))
                    OR (e.event_type = 'COMMENT' AND e.user_id IS NOT NULL AND (
                        EXISTS (SELECT 1 FROM paste_comments c WHERE c.id = e.source_comment_id
                            AND c.paste_id = e.paste_id AND c.user_id = e.user_id)
                        OR EXISTS (SELECT 1 FROM replies r WHERE r.id = e.source_reply_id
                            AND r.paste_id = e.paste_id AND r.author_id = e.user_id
                            AND r.parent_reply_id IS NULL AND NOT r.is_deleted)))
                    OR (e.event_type = 'REPLY' AND e.user_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM replies r JOIN replies parent ON parent.id = r.parent_reply_id
                        WHERE r.id = e.source_reply_id AND r.paste_id = e.paste_id
                            AND r.author_id = e.user_id AND NOT r.is_deleted AND NOT parent.is_deleted))
                )
        ), scores AS (
            SELECT p.id, p.user_id, p.created_at, COALESCE(SUM(c.contribution), 0.0) AS score
            FROM eligible p LEFT JOIN contributions c ON c.paste_id = p.id
            GROUP BY p.id, p.user_id, p.created_at
        ), authors AS (
            SELECT s.*, ROW_NUMBER() OVER (
                PARTITION BY COALESCE(CAST(s.user_id AS text), 'anonymous-' || CAST(s.id AS text))
                ORDER BY s.score DESC, CASE WHEN s.score = 0 THEN s.created_at END DESC, s.id
            ) AS author_rank FROM scores s
        ), engaged AS (
            SELECT a.*, ROW_NUMBER() OVER (
                ORDER BY a.score DESC, a.id
            ) AS engagement_rank FROM authors a WHERE a.score > 0 AND a.author_rank <= :authorCap
        ), fresh AS (
            SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.created_at DESC, s.id) AS fresh_rank
            FROM authors s WHERE s.score = 0 AND s.author_rank <= :authorCap
                AND s.created_at >= :explorationStart AND s.created_at <= :now
        ), allowance AS (
            SELECT LEAST(COUNT(*), :explorationSlots) AS slots FROM fresh
        ), ordered AS (
            SELECT s.id, s.score, s.created_at,
                CASE WHEN s.author_rank > :authorCap THEN 4
                    WHEN e.engagement_rank <= :firstPageSlots + (:explorationSlots - a.slots) THEN 0
                    WHEN f.fresh_rank <= a.slots THEN 1
                    WHEN e.engagement_rank IS NOT NULL THEN 2 ELSE 3 END AS tier,
                e.engagement_rank, f.fresh_rank
            FROM authors s LEFT JOIN engaged e ON e.id = s.id LEFT JOIN fresh f ON f.id = s.id
                CROSS JOIN allowance a
        )
        SELECT id, score FROM ordered
        ORDER BY tier, engagement_rank NULLS LAST, fresh_rank NULLS LAST,
            CASE WHEN tier = 4 THEN score END DESC, created_at DESC, id
        """;
}
