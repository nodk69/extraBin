package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.Paste;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface PasteRepository extends JpaRepository<Paste, Long> {

    Optional<Paste> findByPublicId(String publicId);

    @Query("SELECT p FROM Paste p WHERE p.publicId = :publicId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Optional<Paste> findActiveByPublicId(@Param("publicId") String publicId, @Param("now") Instant now);

    @Query("SELECT DISTINCT p FROM Paste p LEFT JOIN FETCH p.files WHERE p.publicId = :publicId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Optional<Paste> findActiveByPublicIdWithFiles(@Param("publicId") String publicId, @Param("now") Instant now);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Paste p WHERE p.publicId = :publicId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Optional<Paste> findActiveByPublicIdForUpdate(@Param("publicId") String publicId, @Param("now") Instant now);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT DISTINCT p FROM Paste p LEFT JOIN FETCH p.files WHERE p.publicId = :publicId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Optional<Paste> findActiveByPublicIdWithFilesForUpdate(@Param("publicId") String publicId, @Param("now") Instant now);

    // Discovery feed/search. Eligibility comes from the single shared predicate in PasteQueries so
    // every public surface (feed, tags, most-saved) enforces identical rules. Sorting is supplied
    // via validated Pageable; callers must always append publicId ASC as the deterministic tie-break.
    @Query(value = "SELECT DISTINCT p FROM Paste p LEFT JOIN p.tags t WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " AND (:language IS NULL OR p.language = :language)" +
           " AND (:tagName IS NULL OR t.name = :tagName)" +
           " AND (:qPattern IS NULL OR LOWER(p.title) LIKE :qPattern ESCAPE '!' OR LOWER(p.content) LIKE :qPattern ESCAPE '!' OR LOWER(t.name) LIKE :qPattern ESCAPE '!')" +
           " AND (:windowStart IS NULL OR p.createdAt >= :windowStart)",
           countQuery = "SELECT count(DISTINCT p.id) FROM Paste p LEFT JOIN p.tags t WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " AND (:language IS NULL OR p.language = :language)" +
           " AND (:tagName IS NULL OR t.name = :tagName)" +
           " AND (:qPattern IS NULL OR LOWER(p.title) LIKE :qPattern ESCAPE '!' OR LOWER(p.content) LIKE :qPattern ESCAPE '!' OR LOWER(t.name) LIKE :qPattern ESCAPE '!')" +
           " AND (:windowStart IS NULL OR p.createdAt >= :windowStart)")
    Page<Paste> findDiscoveryPastes(@Param("now") Instant now,
                                    @Param("language") String language,
                                    @Param("tagName") String tagName,
                                    @Param("qPattern") String qPattern,
                                    @Param("windowStart") Instant windowStart,
                                    Pageable pageable);

    @Query(value = "SELECT DISTINCT p FROM Paste p WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " AND p.starsCount > 0" +
           " AND (:language IS NULL OR p.language = :language)",
           countQuery = "SELECT count(DISTINCT p.id) FROM Paste p WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " AND p.starsCount > 0" +
           " AND (:language IS NULL OR p.language = :language)")
    Page<Paste> findMostSavedPastes(@Param("now") Instant now,
                                    @Param("language") String language,
                                    Pageable pageable);

    // Public author surfaces. Eligibility comes from the same shared predicate as every other
    // public surface; ownership is the persisted user_id column (never request-supplied identity).
    // Sorting is supplied via validated Pageable; callers always append publicId ASC as the tie-break.
    @Query(value = "SELECT p FROM Paste p WHERE p.userId = :userId AND " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE,
           countQuery = "SELECT count(p) FROM Paste p WHERE p.userId = :userId AND " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE)
    Page<Paste> findEligiblePublicPastesByAuthor(@Param("userId") Long userId,
                                                 @Param("now") Instant now,
                                                 Pageable pageable);

    @Query("SELECT p FROM Paste p WHERE p.userId = :userId AND " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " ORDER BY p.createdAt DESC, p.publicId ASC")
    java.util.List<Paste> findRecentEligiblePublicPastesByAuthor(@Param("userId") Long userId,
                                                                 @Param("now") Instant now,
                                                                 Pageable limit);

    // Returns one row: {eligible paste count, total views, total saves}. Aggregates use exactly the
    // same predicate as the listing so counts can never drift from the rows a profile can show.
    @Query("SELECT COUNT(p), COALESCE(SUM(p.views), 0), COALESCE(SUM(p.starsCount), 0) FROM Paste p " +
           "WHERE p.userId = :userId AND " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE)
    java.util.List<Object[]> countEligiblePublicPastesByAuthor(@Param("userId") Long userId,
                                                               @Param("now") Instant now);

    // Returns Object[] rows of {tagName (String), distinct eligible paste count (Long)}, most-saved first.
    @Query("SELECT t.name, COUNT(DISTINCT p.id) FROM Paste p JOIN p.tags t WHERE " + PasteQueries.ELIGIBLE_PUBLIC_PREDICATE +
           " GROUP BY t.name ORDER BY COUNT(DISTINCT p.id) DESC, t.name ASC")
    java.util.List<Object[]> countPublicTagUsage(@Param("now") Instant now, Pageable limit);

    // Returns Object[] rows of {pasteId (Long), tagName (String)} for batch tag assembly.
    @Query("SELECT p.id, t.name FROM Paste p JOIN p.tags t WHERE p.id IN :ids ORDER BY t.name ASC")
    java.util.List<Object[]> findTagNamesByPasteIds(@Param("ids") java.util.Collection<Long> ids);

    @Query("SELECT p FROM Paste p WHERE p.userId = :userId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Page<Paste> findActiveUserPastes(@Param("userId") Long userId, @Param("now") Instant now, Pageable pageable);

    @Query("SELECT p FROM Paste p WHERE p.userId = :userId AND p.folder.id = :folderId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Page<Paste> findActiveUserPastesByFolder(@Param("userId") Long userId, @Param("folderId") Long folderId, @Param("now") Instant now, Pageable pageable);

    @Query("SELECT p FROM Paste p WHERE p.userId = :userId AND p.folder IS NULL AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    Page<Paste> findActiveUserPastesUnfiled(@Param("userId") Long userId, @Param("now") Instant now, Pageable pageable);

    // Unified library query: optional search (title/content, case-insensitive) and optional tag filter.
    // Sorting is supplied via validated Pageable (whitelisted properties only).
    @Query(value = "SELECT DISTINCT p FROM Paste p LEFT JOIN p.tags t " +
           "WHERE p.userId = :userId AND (p.expiresAt IS NULL OR p.expiresAt > :now) " +
           "AND (:folderId IS NULL OR p.folder.id = :folderId) " +
           "AND (:unfiled = false OR p.folder IS NULL) " +
           "AND (:tagName IS NULL OR t.name = :tagName) " +
           "AND (:search IS NULL OR LOWER(p.title) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.content) LIKE LOWER(CONCAT('%', :search, '%')))",
           countQuery = "SELECT count(DISTINCT p.id) FROM Paste p LEFT JOIN p.tags t " +
           "WHERE p.userId = :userId AND (p.expiresAt IS NULL OR p.expiresAt > :now) " +
           "AND (:folderId IS NULL OR p.folder.id = :folderId) " +
           "AND (:unfiled = false OR p.folder IS NULL) " +
           "AND (:tagName IS NULL OR t.name = :tagName) " +
           "AND (:search IS NULL OR LOWER(p.title) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.content) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Paste> findUserLibraryPastes(@Param("userId") Long userId,
                                      @Param("now") Instant now,
                                      @Param("folderId") Long folderId,
                                      @Param("unfiled") boolean unfiled,
                                      @Param("tagName") String tagName,
                                      @Param("search") String search,
                                      Pageable pageable);

    // Recently edited: lastEditedAt is stamped only by the content-edit path, so same-millisecond
    // create+edit sequences and share-link management operations are not conflated with edits.
    @Query("SELECT p FROM Paste p WHERE p.userId = :userId AND p.lastEditedAt IS NOT NULL " +
           "AND (p.expiresAt IS NULL OR p.expiresAt > :now) " +
           "ORDER BY p.lastEditedAt DESC, p.id DESC")
    java.util.List<Paste> findRecentlyEditedByUser(@Param("userId") Long userId, @Param("now") Instant now, Pageable pageable);

    @Modifying
    @Query("UPDATE Paste p SET p.folder = null WHERE p.folder.id = :folderId")
    int disassociateFolder(@Param("folderId") Long folderId);

    boolean existsByPublicId(String publicId);

    @Query("SELECT p.id FROM Paste p WHERE p.expiresAt IS NOT NULL AND p.expiresAt <= :now")
    java.util.List<Long> findExpiredPasteIds(@Param("now") Instant now, Pageable pageable);

    @Modifying
    @Query("DELETE FROM Paste p WHERE p.id IN :ids")
    int deletePastesByIds(@Param("ids") java.util.List<Long> ids);

    @Modifying
    @Query("DELETE FROM Paste p WHERE p.expiresAt IS NOT NULL AND p.expiresAt <= :now")
    int deleteExpiredPastes(@Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.views = p.views + 1 WHERE p.id = :id")
    int incrementViews(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.expiresAt = :now WHERE p.id = :id AND p.burnAfterReading = true AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    int consumeBurnAfterReading(@Param("id") Long id, @Param("now") Instant now);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Paste p WHERE p.id = :id")
    Optional<Paste> findByIdForUpdate(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.upvotes = p.upvotes + 1 WHERE p.id = :id")
    int incrementUpvotes(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.upvotes = p.upvotes - 1 WHERE p.id = :id AND p.upvotes > 0")
    int decrementUpvotes(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.downvotes = p.downvotes + 1 WHERE p.id = :id")
    int incrementDownvotes(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.downvotes = p.downvotes - 1 WHERE p.id = :id AND p.downvotes > 0")
    int decrementDownvotes(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.upvotes = p.upvotes - 1, p.downvotes = p.downvotes + 1 WHERE p.id = :id AND p.upvotes > 0")
    int toggleUpToDown(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.downvotes = p.downvotes - 1, p.upvotes = p.upvotes + 1 WHERE p.id = :id AND p.downvotes > 0")
    int toggleDownToUp(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.starsCount = p.starsCount + 1 WHERE p.id = :id")
    int incrementStars(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET p.starsCount = p.starsCount - 1 WHERE p.id = :id AND p.starsCount > 0")
    int decrementStars(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Paste p SET " +
           "p.upvotes = COALESCE((SELECT COUNT(pv) FROM PasteVote pv WHERE pv.paste.id = p.id AND pv.voteType = com.pastebin.paste.domain.VoteType.UP), 0), " +
           "p.downvotes = COALESCE((SELECT COUNT(pv) FROM PasteVote pv WHERE pv.paste.id = p.id AND pv.voteType = com.pastebin.paste.domain.VoteType.DOWN), 0), " +
           "p.starsCount = COALESCE((SELECT COUNT(ps) FROM PasteStar ps WHERE ps.paste.id = p.id), 0)")
    int reconcileAllPasteCounters();
}
