package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PasteCommentRepository extends JpaRepository<PasteComment, Long> {

    @Query("SELECT c FROM PasteComment c WHERE c.paste.id = :pasteId ORDER BY c.createdAt ASC")
    List<PasteComment> findByPasteIdOrderByCreatedAtAsc(@Param("pasteId") Long pasteId);

    @Query("SELECT c FROM PasteComment c WHERE c.paste.id = :pasteId ORDER BY c.createdAt ASC")
    Page<PasteComment> findByPasteIdOrderByCreatedAtAsc(@Param("pasteId") Long pasteId, Pageable pageable);

    @Query("SELECT COUNT(c) FROM PasteComment c WHERE c.paste.id = :pasteId")
    long countByPasteId(@Param("pasteId") Long pasteId);

    @Query("SELECT c FROM PasteComment c WHERE c.id = :id AND c.paste.id = :pasteId")
    Optional<PasteComment> findByIdAndPasteId(@Param("id") Long id, @Param("pasteId") Long pasteId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM PasteComment c WHERE c.id = :id AND c.paste.id = :pasteId")
    Optional<PasteComment> findByIdAndPasteIdForUpdate(@Param("id") Long id, @Param("pasteId") Long pasteId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM PasteComment c WHERE c.id = :id")
    Optional<PasteComment> findByIdForUpdate(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET c.upvotes = c.upvotes + 1 WHERE c.id = :id")
    int incrementUpvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET c.upvotes = c.upvotes - 1 WHERE c.id = :id AND c.upvotes > 0")
    int decrementUpvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET c.downvotes = c.downvotes + 1 WHERE c.id = :id")
    int incrementDownvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET c.downvotes = c.downvotes - 1 WHERE c.id = :id AND c.downvotes > 0")
    int decrementDownvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET c.upvotes = c.upvotes - 1, c.downvotes = c.downvotes + 1 WHERE c.id = :id AND c.upvotes > 0")
    int toggleUpToDown(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET c.downvotes = c.downvotes - 1, c.upvotes = c.upvotes + 1 WHERE c.id = :id AND c.downvotes > 0")
    int toggleDownToUp(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PasteComment c SET " +
           "c.upvotes = COALESCE((SELECT COUNT(cv) FROM PasteCommentVote cv WHERE cv.comment.id = c.id AND cv.voteType = com.pastebin.paste.domain.VoteType.UP), 0), " +
           "c.downvotes = COALESCE((SELECT COUNT(cv) FROM PasteCommentVote cv WHERE cv.comment.id = c.id AND cv.voteType = com.pastebin.paste.domain.VoteType.DOWN), 0)")
    int reconcileAllCommentCounters();
}
