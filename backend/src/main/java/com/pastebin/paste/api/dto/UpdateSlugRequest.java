package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateSlugRequest(
        @NotBlank(message = "New link name must not be blank")
        @Size(min = 3, max = 50, message = "New link name must be between 3 and 50 characters")
        String newSlug,

        String deletionCapability
) {}
