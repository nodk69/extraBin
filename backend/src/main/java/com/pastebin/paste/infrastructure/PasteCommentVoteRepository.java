package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteCommentVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PasteCommentVoteRepository extends JpaRepository<PasteCommentVote, Long> {

    @Query("SELECT cv FROM PasteCommentVote cv WHERE cv.comment.id = :commentId AND cv.userId = :userId")
    Optional<PasteCommentVote> findByCommentIdAndUserId(@Param("commentId") Long commentId, @Param("userId") Long userId);

    @Query("SELECT cv FROM PasteCommentVote cv WHERE cv.comment.id = :commentId AND cv.clientIpHash = :clientIpHash")
    Optional<PasteCommentVote> findByCommentIdAndClientIpHash(@Param("commentId") Long commentId, @Param("clientIpHash") String clientIpHash);

    @Query("SELECT cv FROM PasteCommentVote cv WHERE cv.userId = :userId")
    List<PasteCommentVote> findByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM PasteCommentVote cv WHERE cv.userId IS NULL")
    int deleteAllAnonymous();
}
