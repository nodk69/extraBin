package com.pastebin.paste.api.dto;

import java.time.Instant;

public record PasteMetadataHtmlResponse(
        String publicId,
        String title,
        Instant expiresAt
) {
}
