package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * Response returned to the author of a comment. Internal user identifiers are
 * deliberately not exposed (audit finding P2-01). The one-time deletion capability
 * keeps its published JSON name ("deletionCapability") for API compatibility.
 */
public record CreateCommentResponse(
        Long id,
        String pasteId,
        String authorName,
        String content,
        boolean isPasteAuthor,
        boolean isAuthenticatedUser,
        Instant createdAt,
        @JsonProperty("deletionCapability") String deletionCapability
) {}
