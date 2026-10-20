package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PasteFileResponse(
        Long id,
        String filename,
        String content,
        String language,
        int sizeBytes,
        int lineCount,
        int sortOrder,
        byte[] ciphertext,
        byte[] nonce,
        byte[] authTag
) {
    public PasteFileResponse(Long id, String filename, String content, String language, int sizeBytes, int lineCount, int sortOrder) {
        this(id, filename, content, language, sizeBytes, lineCount, sortOrder, null, null, null);
    }
}
