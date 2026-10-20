package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCommentRequest(
        @NotBlank(message = "Comment content must not be blank.")
        @Size(min = 1, max = 2000, message = "Comment must be between 1 and 2000 characters.")
        String content,

        @Size(max = 50, message = "Author name cannot exceed 50 characters.")
        String authorName
) {}
