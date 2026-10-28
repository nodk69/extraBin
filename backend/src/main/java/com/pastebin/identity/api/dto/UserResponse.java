package com.pastebin.identity.api.dto;

import java.time.Instant;

public record UserResponse(
        Long id,
        String username,
        String email,
        String role,
        boolean emailVerified,
        Instant createdAt,
        String displayName,
        String bio,
        String avatarUrl,
        String githubUrl,
        String linkedinUrl,
        String xUrl
) {}
