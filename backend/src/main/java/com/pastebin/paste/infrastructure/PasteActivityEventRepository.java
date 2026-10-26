package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.ActivityEventType;
import com.pastebin.paste.domain.PasteActivityEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface PasteActivityEventRepository extends JpaRepository<PasteActivityEvent, Long> {

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

    @Query("SELECT pae.paste.id, " +
           "SUM(CASE WHEN pae.eventType = com.pastebin.paste.domain.ActivityEventType.VIEW THEN 1.0 " +
           "         WHEN pae.eventType = com.pastebin.paste.domain.ActivityEventType.UPVOTE THEN 2.0 " +
           "         WHEN pae.eventType = com.pastebin.paste.domain.ActivityEventType.STAR THEN 3.0 " +
           "         ELSE 0.0 END) as score " +
           "FROM PasteActivityEvent pae JOIN pae.paste p " +
           "WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE + " " +
           "AND pae.createdAt >= :windowStart " +
           "AND (:language IS NULL OR p.language = :language) " +
           "GROUP BY pae.paste.id " +
           "ORDER BY score DESC, pae.paste.id ASC")
    List<Object[]> findTrendingPasteIdsAndScores(@Param("now") Instant now,
                                                 @Param("windowStart") Instant windowStart,
                                                 @Param("language") String language,
                                                 Pageable pageable);

    @Query("SELECT COUNT(DISTINCT pae.paste.id) " +
           "FROM PasteActivityEvent pae JOIN pae.paste p " +
           "WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE + " " +
           "AND pae.createdAt >= :windowStart " +
           "AND (:language IS NULL OR p.language = :language)")
    long countTrendingEligiblePastes(@Param("now") Instant now,
                                     @Param("windowStart") Instant windowStart,
                                     @Param("language") String language);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.createdAt < :cutoff")
    int deleteEventsOlderThan(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.paste.id = :pasteId AND pae.userId = :userId AND pae.eventType = :eventType")
    int deleteUserEvents(@Param("pasteId") Long pasteId, @Param("userId") Long userId, @Param("eventType") ActivityEventType eventType);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.paste.id = :pasteId")
    int deleteByPasteId(@Param("pasteId") Long pasteId);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.paste.id IN :pasteIds")
    int deleteByPasteIds(@Param("pasteIds") java.util.Collection<Long> pasteIds);

    @Modifying
    @Query("DELETE FROM PasteActivityEvent pae WHERE pae.paste.id = :pasteId AND pae.clientIpHash = :clientIpHash AND pae.eventType = :eventType")
    int deleteIpEvents(@Param("pasteId") Long pasteId, @Param("clientIpHash") String clientIpHash, @Param("eventType") ActivityEventType eventType);
}
