package com.pastebin.paste.api.dto;

public record PasteStarResponse(
        String pasteId,
        long starsCount,
        boolean isStarred
) {}
