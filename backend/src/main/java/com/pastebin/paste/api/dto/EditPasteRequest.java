package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.Visibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record EditPasteRequest(
        @Size(max = 100, message = "Title must not exceed 100 characters")
        String title,

        String content,

        @Size(max = 50, message = "Language must not exceed 50 characters")
        String language,

        @NotNull(message = "Visibility is required")
        Visibility visibility,

        @NotNull(message = "Version is required for optimistic concurrency control")
        Long version,

        List<@Valid EditPasteFileItemRequest> files
) {
    public EditPasteRequest(String title, String content, String language, Visibility visibility, Long version) {
        this(title, content, language, visibility, version, null);
    }
}
