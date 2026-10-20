package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateReplyRequest(
        @NotBlank(message = "Reply content must not be blank.")
        @Size(min = 1, max = 5000, message = "Reply content must be between 1 and 5000 characters.")
        String content,

        @JsonProperty("parent_reply_id")
        @JsonAlias({"parentReplyId", "parent_reply_id"})
        Long parentReplyId
) {
}
