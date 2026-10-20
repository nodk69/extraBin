package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreatePasteRequest(
        @Size(max = 100, message = "Title must not exceed 100 characters")
        String title,

        String content,

        @Size(max = 50, message = "Language identifier must not exceed 50 characters")
        String language,

        @NotNull(message = "Visibility is required")
        Visibility visibility,

        @NotNull(message = "Expiration policy is required")
        ExpirationPolicy expiration,

        @Size(max = 100, message = "Password must not exceed 100 characters")
        String password,

        List<@Valid PasteFileRequest> files,

        Long folderId,

        String website,

        @Size(max = 50, message = "Custom slug must not exceed 50 characters")
        String customSlug
) {
    public CreatePasteRequest(String title, String content, String language, Visibility visibility, ExpirationPolicy expiration) {
        this(title, content, language, visibility, expiration, null, null, null, null, null);
    }

    public CreatePasteRequest(String title, String content, String language, Visibility visibility, ExpirationPolicy expiration, String password) {
        this(title, content, language, visibility, expiration, password, null, null, null, null);
    }

    public CreatePasteRequest(String title, List<PasteFileRequest> files, Visibility visibility, ExpirationPolicy expiration, String password) {
        this(title, null, null, visibility, expiration, password, files, null, null, null);
    }

    public CreatePasteRequest(String title, String content, String language, Visibility visibility, ExpirationPolicy expiration, String password, List<PasteFileRequest> files) {
        this(title, content, language, visibility, expiration, password, files, null, null, null);
    }

    public CreatePasteRequest(String title, String content, String language, Visibility visibility, ExpirationPolicy expiration, String password, List<PasteFileRequest> files, Long folderId) {
        this(title, content, language, visibility, expiration, password, files, folderId, null, null);
    }

    public CreatePasteRequest(String title, String content, String language, Visibility visibility, ExpirationPolicy expiration, String password, List<PasteFileRequest> files, Long folderId, String website) {
        this(title, content, language, visibility, expiration, password, files, folderId, website, null);
    }
}
