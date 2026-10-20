package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RotateLinkResponse(
        String id,
        String shareToken
) {}
