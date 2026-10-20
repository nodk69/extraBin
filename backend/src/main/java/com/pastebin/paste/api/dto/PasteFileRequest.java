package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasteFileRequest(
        @NotBlank(message = "Filename must not be blank")
        @Size(max = 255, message = "Filename must not exceed 255 characters")
        String filename,

        @NotBlank(message = "File content must not be blank")
        String content,

        @Size(max = 50, message = "Language must not exceed 50 characters")
        String language
) {}
