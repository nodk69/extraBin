package com.pastebin.paste.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EditReplyRequest(
        @NotBlank(message = "Reply content must not be blank.")
        @Size(min = 1, max = 5000, message = "Reply content must be between 1 and 5000 characters.")
        String content
) {
}
