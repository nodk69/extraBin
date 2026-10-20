package com.pastebin.paste.domain;

import java.time.Duration;
import java.time.Instant;

public enum ExpirationPolicy {
    VIEW_ONCE(Duration.ofDays(7)),
    BURN_AFTER_READING(Duration.ofDays(7)),
    TEN_MINUTES(Duration.ofMinutes(10)),
    ONE_HOUR(Duration.ofHours(1)),
    ONE_DAY(Duration.ofDays(1)),
    ONE_WEEK(Duration.ofDays(7)),
    ONE_MONTH(Duration.ofDays(30)),
    SIX_MONTHS(Duration.ofDays(180)),
    ONE_YEAR(Duration.ofDays(365)),
    NEVER(null);

    private final Duration duration;

    ExpirationPolicy(Duration duration) {
        this.duration = duration;
    }

    public Duration getDuration() {
        return duration;
    }

    public boolean isBurnAfterReading() {
        return this == BURN_AFTER_READING || this == VIEW_ONCE;
    }

    public boolean isViewOnce() {
        return this == BURN_AFTER_READING || this == VIEW_ONCE;
    }

    public Instant calculateExpiresAt(Instant fromTime) {
        if (this == NEVER || duration == null) {
            return null;
        }
        return fromTime.plus(duration);
    }
}
