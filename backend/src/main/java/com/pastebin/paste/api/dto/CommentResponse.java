package com.pastebin.paste.api.dto;

import java.time.Instant;

/**
 * Public comment view. Internal user identifiers are deliberately not exposed
 * (audit finding P2-01): author attribution is carried by the server-computed
 * {@code authorName}, {@code isPasteAuthor} and {@code isAuthenticatedUser} flags.
 */
public record CommentResponse(
        Long id,
        String pasteId,
        String authorName,
        String content,
        boolean isPasteAuthor,
        boolean isAuthenticatedUser,
        boolean canDelete,
        Instant createdAt,
        long upvotes,
        long downvotes,
        com.pastebin.paste.domain.VoteType userVote
) {
    public CommentResponse(Long id, String pasteId, String authorName, String content,
                           boolean isPasteAuthor, boolean isAuthenticatedUser,
                           boolean canDelete, Instant createdAt) {
        this(id, pasteId, authorName, content, isPasteAuthor, isAuthenticatedUser, canDelete, createdAt, 0L, 0L, null);
    }
}
