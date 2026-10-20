package com.pastebin.paste.api.dto;

import java.time.Instant;

public record UnlockResponse(
        String unlockToken,
        Instant expiresAt
) {}
