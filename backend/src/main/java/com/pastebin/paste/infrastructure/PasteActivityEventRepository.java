package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.ActivityEventType;
import com.pastebin.paste.domain.PasteActivityEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
public interface PasteActivityEventRepository extends JpaRepository<PasteActivityEvent, Long>, TrendingRankingRepository {

    @Query("SELECT COUNT(pae) > 0 FROM PasteActivityEvent pae " +
           "WHERE pae.paste.id = :pasteId " +
           "AND pae.eventType = :eventType " +
           "AND pae.userId = :userId " +
           "AND pae.createdAt >= :since")
    boolean existsRecentByUserId(@Param("pasteId") Long pasteId,
                                 @Param("eventType") ActivityEventType eventType,
                                 @Param("userId") Long userId,
                                 @Param("since") Instant since);

    @Query("SELECT COUNT(pae) > 0 FROM PasteActivityEvent pae " +
           "WHERE pae.paste.id = :pasteId " +
           "AND pae.eventType = :eventType " +
           "AND pae.clientIpHash = :clientIpHash " +
           "AND pae.createdAt >= :since")
    boolean existsRecentByIpHash(@Param("pasteId") Long pasteId,
                                 @Param("eventType") ActivityEventType eventType,
                                 @Param("clientIpHash") String clientIpHash,
                                 @Param("since") Instant since);

    @Query("SELECT COUNT(p) FROM Paste p WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " AND :windowStart <= :now AND (:language IS NULL OR p.language = :language)")
    long countTrendingEligiblePastes(@Param("now") Instant now,
                                     @Param("windowStart") Instant windowStart,
                                     @Param("language") String language);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.createdAt < :cutoff")
    int deleteEventsOlderThan(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query("UPDATE PasteActivityEvent pae SET pae.active = false WHERE pae.paste.id = :pasteId AND pae.userId = :userId AND pae.eventType = :eventType")
    int revokeUserEvents(@Param("pasteId") Long pasteId, @Param("userId") Long userId, @Param("eventType") ActivityEventType eventType);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.paste.id = :pasteId")
    int deleteByPasteId(@Param("pasteId") Long pasteId);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.paste.id IN :pasteIds")
    int deleteByPasteIds(@Param("pasteIds") java.util.Collection<Long> pasteIds);

    @Modifying
    @Query("UPDATE PasteActivityEvent pae SET pae.active = false WHERE pae.paste.id = :pasteId AND pae.clientIpHash = :clientIpHash AND pae.eventType = :eventType")
    int revokeIpEvents(@Param("pasteId") Long pasteId, @Param("clientIpHash") String clientIpHash, @Param("eventType") ActivityEventType eventType);

    @Modifying
    @Query(value = "INSERT INTO paste_activity_events (paste_id, event_type, user_id, client_ip_hash, source_comment_id, source_reply_id, created_at, view_bucket) "
            + "VALUES (:pasteId, :type, :userId, :ipHash, :commentId, :replyId, :occurredAt, :bucket) ON CONFLICT DO NOTHING", nativeQuery = true)
    int insertIfAbsent(@Param("pasteId") Long pasteId, @Param("type") String type,
                       @Param("userId") Long userId, @Param("ipHash") String ipHash,
                       @Param("commentId") Long commentId, @Param("replyId") Long replyId,
                       @Param("occurredAt") Instant occurredAt, @Param("bucket") Long bucket);
}
