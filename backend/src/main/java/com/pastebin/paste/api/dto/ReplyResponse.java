package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.pastebin.paste.domain.VoteType;
import java.time.Instant;
import java.util.List;

public record ReplyResponse(
        Long id,
        String pasteId,
        @JsonProperty("parent_reply_id")
        Long parentReplyId,
        Long authorId,
        String authorUsername,
        String content,
        boolean isDeleted,
        boolean isAuthor,
        int depth,
        long upvotes,
        long downvotes,
        VoteType userVote,
        Instant createdAt,
        Instant updatedAt,
        List<ReplyResponse> children
) {
}
