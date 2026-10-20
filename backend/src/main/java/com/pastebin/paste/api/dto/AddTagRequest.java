package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddTagRequest(
        @NotBlank(message = "Tag name is required")
        @Size(max = 50, message = "Tag name must not exceed 50 characters")
        String name
) {
}
