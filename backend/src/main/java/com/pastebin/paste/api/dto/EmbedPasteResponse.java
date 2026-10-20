package com.pastebin.paste.api.dto;

import java.time.Instant;
import java.util.List;

public record EmbedPasteResponse(
        String publicId,
        String title,
        String language,
        Instant createdAt,
        List<PasteFileResponse> files
) {}
