package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.Visibility;
import java.time.Instant;
import java.util.List;

public record PasteSummaryResponse(
        String id,
        String title,
        String language,
        Visibility visibility,
        int contentSizeBytes,
        int lineCount,
        Instant createdAt,
        Instant expiresAt,
        Long version,
        long views,
        Long folderId,
        String folderName,
        String authorUsername,
        List<String> tags,
        long starsCount
) {
    public PasteSummaryResponse(String id, String title, String language,
                                Visibility visibility, int contentSizeBytes, int lineCount,
                                Instant createdAt, Instant expiresAt, Long version, long views,
                                Long folderId, String folderName) {
        this(id, title, language, visibility, contentSizeBytes, lineCount, createdAt, expiresAt,
                version, views, folderId, folderName, null, List.of(), 0L);
    }

    public PasteSummaryResponse(String id, String title, String language,
                                Visibility visibility, int contentSizeBytes, int lineCount,
                                Instant createdAt, Instant expiresAt, Long version, long views) {
        this(id, title, language, visibility, contentSizeBytes, lineCount, createdAt, expiresAt,
                version, views, null, null, null, List.of(), 0L);
    }

    public PasteSummaryResponse(String id, String title, String language,
                                Visibility visibility, int contentSizeBytes, int lineCount,
                                Instant createdAt, Instant expiresAt, Long version) {
        this(id, title, language, visibility, contentSizeBytes, lineCount, createdAt, expiresAt,
                version, 0L, null, null, null, List.of(), 0L);
    }
}
