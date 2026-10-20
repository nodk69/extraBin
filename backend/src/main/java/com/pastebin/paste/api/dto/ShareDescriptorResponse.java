package com.pastebin.paste.api.dto;

public record ShareDescriptorResponse(
        String id,
        String canonicalUrl,
        String rawUrl,
        String downloadUrl,
        String zipDownloadUrl,
        String embedUrl,
        String visibility,
        String shareStatus,
        boolean passwordRequired,
        boolean ogEligible
) {}
