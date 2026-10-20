package com.pastebin.identity.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record SupabaseSyncRequest(
        @NotBlank(message = "Access token is required")
        String accessToken,

        @NotBlank(message = "Email is required")
        @Email(message = "Invalid email format")
        String email,

        String username
) {}
