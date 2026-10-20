package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;

public record DeleteAnonymousPasteRequest(
        @NotBlank(message = "Deletion capability is required")
        String deletionCapability
) {}
