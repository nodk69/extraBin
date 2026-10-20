package com.pastebin.notification.api.dto;

import java.time.Instant;

public record NotificationResponse(
        Long id,
        String type,
        String message,
        String pasteId,
        Long replyId,
        String actorUsername,
        boolean isRead,
        Instant createdAt
) {
}
