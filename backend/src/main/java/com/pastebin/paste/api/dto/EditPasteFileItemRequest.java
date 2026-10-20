package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record EditPasteFileItemRequest(
        Long id,

        @NotBlank(message = "Filename must not be blank")
        @Size(max = 255, message = "Filename must not exceed 255 characters")
        String filename,

        @NotNull(message = "File content must not be null")
        String content,

        @Size(max = 50, message = "Language must not exceed 50 characters")
        String language
) {
    public EditPasteFileItemRequest(String filename, String content, String language) {
        this(null, filename, content, language);
    }
}
