package com.pastebin.notification.api.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateNotificationPreferencesRequest(
        @NotNull Boolean notifyOnReplies,
        @NotNull Boolean notifyOnFollows
) {}
