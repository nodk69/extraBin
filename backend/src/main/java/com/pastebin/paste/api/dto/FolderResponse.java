package com.pastebin.paste.api.dto;

import java.time.Instant;

public record FolderResponse(
        Long id,
        String name,
        long pasteCount,
        Instant createdAt,
        Instant updatedAt
) {}
