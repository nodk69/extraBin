package com.pastebin.identity.api.dto;

import jakarta.validation.constraints.Size;

/**
 * Full replacement of the caller's public profile fields.
 *
 * <p>Every field is optional; {@code null} or a blank string clears it. Social links may be
 * supplied either as a full profile URL or as a bare handle (for example {@code @octocat});
 * {@code AuthService} normalizes them to an HTTPS profile URL.
 */
public record UpdateProfileRequest(
        @Size(max = 80, message = "Display name must be at most 80 characters")
        String displayName,

        @Size(max = 500, message = "Bio must be at most 500 characters")
        String bio,

        @Size(max = 500, message = "Avatar URL must be at most 500 characters")
        String avatarUrl,

        @Size(max = 255, message = "GitHub link must be at most 255 characters")
        String githubUrl,

        @Size(max = 255, message = "LinkedIn link must be at most 255 characters")
        String linkedinUrl,

        @Size(max = 255, message = "X link must be at most 255 characters")
        String xUrl
) {
}
