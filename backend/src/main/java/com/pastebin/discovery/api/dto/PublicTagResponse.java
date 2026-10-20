package com.pastebin.discovery.api.dto;

public record PublicTagResponse(
        String name,
        long pasteCount
) {
}
