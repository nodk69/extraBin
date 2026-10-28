package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PasteRevisionResponse(
        Long id,
        Long version,
        String title,
        String content,
        String language,
        Instant createdAt,
        List<PasteRevisionFileResponse> files
) {
    public PasteRevisionResponse(Long id, Long version, String title, String content, String language, Instant createdAt) {
        this(id, version, title, content, language, createdAt, List.of());
    }
}
