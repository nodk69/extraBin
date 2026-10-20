package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = false)
public record RotateLinkRequest(
        @Size(max = 128, message = "Deletion capability must not exceed 128 characters")
        String deletionCapability
) {}
