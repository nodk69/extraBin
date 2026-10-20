package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.pastebin.paste.domain.EncryptionMode;
import com.pastebin.paste.domain.Visibility;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CreatePasteResponse(
        String id,
        String title,
        String language,
        Visibility visibility,
        int contentSizeBytes,
        int lineCount,
        Instant createdAt,
        Instant expiresAt,
        String deletionCapability,
        boolean burnAfterReading,
        boolean viewOnce,
        boolean passwordProtected,
        EncryptionMode encryptionMode,
        String shareToken
) {
    public CreatePasteResponse(String id, String title, String language, Visibility visibility,
                               int contentSizeBytes, int lineCount, Instant createdAt,
                               Instant expiresAt, String deletionCapability,
                               boolean burnAfterReading, boolean viewOnce, boolean passwordProtected,
                               EncryptionMode encryptionMode) {
        this(id, title, language, visibility, contentSizeBytes, lineCount, createdAt,
             expiresAt, deletionCapability, burnAfterReading, viewOnce, passwordProtected, encryptionMode, null);
    }

    public CreatePasteResponse(String id, String title, String language, Visibility visibility,
                               int contentSizeBytes, int lineCount, Instant createdAt,
                               Instant expiresAt, String deletionCapability,
                               boolean burnAfterReading, boolean viewOnce, boolean passwordProtected) {
        this(id, title, language, visibility, contentSizeBytes, lineCount, createdAt,
             expiresAt, deletionCapability, burnAfterReading, viewOnce, passwordProtected, null, null);
    }

    public CreatePasteResponse(String id, String title, String language, Visibility visibility,
                               int contentSizeBytes, int lineCount, Instant createdAt,
                               Instant expiresAt, String deletionCapability) {
        this(id, title, language, visibility, contentSizeBytes, lineCount, createdAt,
             expiresAt, deletionCapability, false, false, false, null, null);
    }
}
