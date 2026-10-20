package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasteFileRequest(
        @NotBlank(message = "Filename must not be blank")
        @Size(max = 255, message = "Filename must not exceed 255 characters")
        String filename,

        // Null/missing content is rejected by PasteService; an empty string is a valid
        // zero-byte file and is intentionally not constrained here.
        String content,

        @Size(max = 50, message = "Language must not exceed 50 characters")
        String language
) {}
