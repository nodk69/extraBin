package com.pastebin.discovery.api.dto;

import java.time.Instant;

public record DeveloperRelationshipResponse(
        String username,
        Instant joinedAt,
        long followerCount,
        long followingCount,
        boolean followedByViewer
) {
}
