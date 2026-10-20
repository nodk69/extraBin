package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.VoteType;
import jakarta.validation.constraints.NotNull;

public record VoteRequest(
        @NotNull(message = "Vote type is required (UP or DOWN)")
        VoteType voteType
) {}
