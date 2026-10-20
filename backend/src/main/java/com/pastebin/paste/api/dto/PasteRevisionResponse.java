package com.pastebin.paste.api.dto;

import java.time.Instant;

public record PasteRevisionResponse(
        Long id,
        Long version,
        String title,
        String content,
        String language,
        Instant createdAt
) {}
