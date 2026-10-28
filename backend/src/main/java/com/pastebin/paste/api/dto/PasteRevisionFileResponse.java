package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PasteRevisionFileResponse(
        Long id,
        String filename,
        String content,
        String language,
        int sizeBytes,
        int lineCount,
        int sortOrder,
        boolean isPrimary
) {
    public PasteRevisionFileResponse(Long id, String filename, String content, String language, int sizeBytes, int lineCount, int sortOrder) {
        this(id, filename, content, language, sizeBytes, lineCount, sortOrder, sortOrder == 0);
    }
}
