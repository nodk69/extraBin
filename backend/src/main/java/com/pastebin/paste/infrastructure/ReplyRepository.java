package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.Reply;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ReplyRepository extends JpaRepository<Reply, Long> {

    @Query("SELECT r FROM Reply r JOIN FETCH r.author WHERE r.paste.id = :pasteId AND r.parentReply IS NULL ORDER BY r.id ASC")
    List<Reply> findRootRepliesInitial(@Param("pasteId") Long pasteId, Pageable pageable);

    @Query("SELECT r FROM Reply r JOIN FETCH r.author WHERE r.paste.id = :pasteId AND r.parentReply IS NULL AND r.id > :cursor ORDER BY r.id ASC")
    List<Reply> findRootRepliesAfterCursor(@Param("pasteId") Long pasteId, @Param("cursor") Long cursor, Pageable pageable);

    @Query("SELECT r FROM Reply r JOIN FETCH r.author WHERE r.parentReply.id IN :parentIds ORDER BY r.createdAt ASC")
    List<Reply> findChildrenByParentIds(@Param("parentIds") List<Long> parentIds);

    @Query("SELECT r FROM Reply r JOIN FETCH r.author WHERE r.id = :id AND r.paste.id = :pasteId")
    Optional<Reply> findByIdAndPasteId(@Param("id") Long id, @Param("pasteId") Long pasteId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Reply r WHERE r.id = :id AND r.paste.id = :pasteId")
    Optional<Reply> findByIdAndPasteIdForUpdate(@Param("id") Long id, @Param("pasteId") Long pasteId);

    @Query("SELECT COUNT(r) FROM Reply r WHERE r.paste.id = :pasteId AND r.isDeleted = false")
    long countActiveByPasteId(@Param("pasteId") Long pasteId);

    @Query("SELECT COUNT(r) FROM Reply r WHERE r.paste.id = :pasteId")
    long countTotalByPasteId(@Param("pasteId") Long pasteId);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Reply r SET r.upvotes = r.upvotes + 1 WHERE r.id = :id")
    int incrementUpvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Reply r SET r.upvotes = r.upvotes - 1 WHERE r.id = :id AND r.upvotes > 0")
    int decrementUpvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Reply r SET r.downvotes = r.downvotes + 1 WHERE r.id = :id")
    int incrementDownvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Reply r SET r.downvotes = r.downvotes - 1 WHERE r.id = :id AND r.downvotes > 0")
    int decrementDownvotes(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Reply r SET r.upvotes = r.upvotes - 1, r.downvotes = r.downvotes + 1 WHERE r.id = :id AND r.upvotes > 0")
    int toggleUpToDown(@Param("id") Long id);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Reply r SET r.downvotes = r.downvotes - 1, r.upvotes = r.upvotes + 1 WHERE r.id = :id AND r.downvotes > 0")
    int toggleDownToUp(@Param("id") Long id);
}
