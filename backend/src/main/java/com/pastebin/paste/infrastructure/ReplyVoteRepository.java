package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.ReplyVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReplyVoteRepository extends JpaRepository<ReplyVote, Long> {

    @Query("SELECT rv FROM ReplyVote rv WHERE rv.reply.id = :replyId AND rv.userId = :userId")
    Optional<ReplyVote> findByReplyIdAndUserId(@Param("replyId") Long replyId, @Param("userId") Long userId);

    @Query("SELECT rv FROM ReplyVote rv WHERE rv.reply.id = :replyId AND rv.clientIpHash = :clientIpHash")
    Optional<ReplyVote> findByReplyIdAndClientIpHash(@Param("replyId") Long replyId, @Param("clientIpHash") String clientIpHash);

    @Query("SELECT rv FROM ReplyVote rv WHERE rv.userId = :userId")
    List<ReplyVote> findByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM ReplyVote rv WHERE rv.userId IS NULL")
    int deleteAllAnonymous();
}
