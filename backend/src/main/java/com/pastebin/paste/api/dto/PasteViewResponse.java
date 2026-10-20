package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pastebin.paste.domain.EncryptionMode;
import com.pastebin.paste.domain.Visibility;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PasteViewResponse(
        String id,
        String title,
        String content,
        String language,
        Visibility visibility,
        int contentSizeBytes,
        int lineCount,
        boolean isOwner,
        Instant createdAt,
        Instant updatedAt,
        Instant expiresAt,
        Long version,
        boolean burnAfterReading,
        boolean viewOnce,
        boolean passwordProtected,
        boolean passwordRequired,
        List<PasteFileResponse> files,
        long views,
        EncryptionMode encryptionMode,
        byte[] kdfSalt,
        Integer kdfIterations,
        byte[] wrappedKey,
        long upvotes,
        long downvotes,
        long starsCount,
        com.pastebin.paste.domain.VoteType userVote,
        boolean isStarred,
        boolean moderationHidden
) {
    public PasteViewResponse(String id, String title, String content, String language,
                             Visibility visibility, int contentSizeBytes, int lineCount,
                             boolean isOwner, Instant createdAt, Instant updatedAt,
                             Instant expiresAt, Long version, boolean burnAfterReading,
                             boolean viewOnce, boolean passwordProtected, boolean passwordRequired,
                             List<PasteFileResponse> files, long views, EncryptionMode encryptionMode,
                             byte[] kdfSalt, Integer kdfIterations, byte[] wrappedKey,
                             long upvotes, long downvotes, long starsCount,
                             com.pastebin.paste.domain.VoteType userVote, boolean isStarred) {
        this(id, title, content, language, visibility, contentSizeBytes, lineCount,
             isOwner, createdAt, updatedAt, expiresAt, version, burnAfterReading,
             viewOnce, passwordProtected, passwordRequired, files, views,
             encryptionMode, kdfSalt, kdfIterations, wrappedKey,
             upvotes, downvotes, starsCount, userVote, isStarred, false);
    }

    public PasteViewResponse(String id, String title, String content, String language,
                             Visibility visibility, int contentSizeBytes, int lineCount,
                             boolean isOwner, Instant createdAt, Instant updatedAt,
                             Instant expiresAt, Long version, boolean burnAfterReading,
                             boolean viewOnce, boolean passwordProtected, boolean passwordRequired,
                             List<PasteFileResponse> files, long views, EncryptionMode encryptionMode,
                             byte[] kdfSalt, Integer kdfIterations, byte[] wrappedKey) {
        this(id, title, content, language, visibility, contentSizeBytes, lineCount,
             isOwner, createdAt, updatedAt, expiresAt, version, burnAfterReading,
             viewOnce, passwordProtected, passwordRequired, files, views,
             encryptionMode, kdfSalt, kdfIterations, wrappedKey,
             0L, 0L, 0L, null, false, false);
    }

    public PasteViewResponse(String id, String title, String content, String language,
                             Visibility visibility, int contentSizeBytes, int lineCount,
                             boolean isOwner, Instant createdAt, Instant updatedAt,
                             Instant expiresAt, Long version, boolean burnAfterReading,
                             boolean viewOnce, boolean passwordProtected, boolean passwordRequired,
                             List<PasteFileResponse> files, long views) {
        this(id, title, content, language, visibility, contentSizeBytes, lineCount,
             isOwner, createdAt, updatedAt, expiresAt, version, burnAfterReading,
             viewOnce, passwordProtected, passwordRequired, files, views,
             null, null, null, null, 0L, 0L, 0L, null, false, false);
    }

    public PasteViewResponse(String id, String title, String content, String language,
                             Visibility visibility, int contentSizeBytes, int lineCount,
                             boolean isOwner, Instant createdAt, Instant updatedAt,
                             Instant expiresAt, Long version, boolean burnAfterReading,
                             boolean viewOnce, boolean passwordProtected, boolean passwordRequired,
                             List<PasteFileResponse> files) {
        this(id, title, content, language, visibility, contentSizeBytes, lineCount,
             isOwner, createdAt, updatedAt, expiresAt, version, burnAfterReading,
             viewOnce, passwordProtected, passwordRequired, files, 0L,
             null, null, null, null, 0L, 0L, 0L, null, false, false);
    }

    public PasteViewResponse(String id, String title, String content, String language,
                             Visibility visibility, int contentSizeBytes, int lineCount,
                             boolean isOwner, Instant createdAt, Instant updatedAt,
                             Instant expiresAt, Long version, boolean burnAfterReading) {
        this(id, title, content, language, visibility, contentSizeBytes, lineCount,
             isOwner, createdAt, updatedAt, expiresAt, version, burnAfterReading,
             burnAfterReading, false, false, Collections.emptyList(), 0L,
             null, null, null, null, 0L, 0L, 0L, null, false, false);
    }

    public PasteViewResponse(String id, String title, String content, String language,
                             Visibility visibility, int contentSizeBytes, int lineCount,
                             boolean isOwner, Instant createdAt, Instant updatedAt,
                             Instant expiresAt, Long version) {
        this(id, title, content, language, visibility, contentSizeBytes, lineCount,
             isOwner, createdAt, updatedAt, expiresAt, version, false, false, false, false,
             Collections.emptyList(), 0L,
             null, null, null, null, 0L, 0L, 0L, null, false, false);
    }
}
