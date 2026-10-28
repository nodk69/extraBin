package com.pastebin.discovery.application;

import com.pastebin.paste.domain.ActivityEventType;
import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TrendingPolicy {
    private final Clock clock;
    @Value("${app.discovery.trending.view-weight:1}") private double viewWeight = 1;
    @Value("${app.discovery.trending.upvote-weight:3}") private double upvoteWeight = 3;
    @Value("${app.discovery.trending.star-weight:4}") private double starWeight = 4;
    @Value("${app.discovery.trending.comment-weight:4}") private double commentWeight = 4;
    @Value("${app.discovery.trending.reply-weight:2}") private double replyWeight = 2;
    @Value("${app.discovery.trending.half-life-24h-hours:6}") private double halfLife24h = 6;
    @Value("${app.discovery.trending.half-life-7d-hours:36}") private double halfLife7d = 36;
    @Value("${app.discovery.trending.half-life-30d-hours:168}") private double halfLife30d = 168;
    @Value("${app.discovery.trending.author-cap:2}") private int authorCap = 2;
    @Value("${app.discovery.trending.exploration-slots:1}") private int explorationSlots = 1;
    @Value("${app.discovery.trending.anonymous-cap:20}") private int anonymousCap = 20;

    public TrendingPolicy() { this(Clock.systemUTC()); }
    public TrendingPolicy(Clock clock) { this.clock = clock; }

    @jakarta.annotation.PostConstruct
    void validateWeights() {
        for (ActivityEventType type : ActivityEventType.values()) {
            double value = weight(type);
            if (!Double.isFinite(value) || value < 0) throw new IllegalStateException("Trending weights must be nonnegative and finite");
        }
        for (String window : new String[]{"24h", "7d", "30d"}) halfLifeSeconds(window(window));
    }

    public Instant now() { return clock.instant(); }
    public double weight(ActivityEventType type) {
        return switch (type) {
            case VIEW -> viewWeight;
            case UPVOTE -> upvoteWeight;
            case STAR -> starWeight;
            case COMMENT -> commentWeight;
            case REPLY -> replyWeight;
        };
    }
    public Duration window(String window) {
        return switch (window) {
            case "7d" -> Duration.ofDays(7);
            case "30d" -> Duration.ofDays(30);
            default -> Duration.ofHours(24);
        };
    }
    public double halfLifeSeconds(Duration window) {
        double hours = window.toDays() >= 30 ? halfLife30d : window.toDays() >= 7 ? halfLife7d : halfLife24h;
        if (!Double.isFinite(hours) || hours <= 0) throw new IllegalStateException("Trending half-life must be positive and finite");
        return hours * 3600;
    }
    public double contribution(ActivityEventType type, Instant occurredAt, Instant reference, String window) {
        if (occurredAt.isAfter(reference) || occurredAt.isBefore(reference.minus(window(window)))) return 0;
        double age = Duration.between(occurredAt, reference).toMillis() / 1000.0;
        return weight(type) * Math.pow(2, -age / halfLifeSeconds(window(window)));
    }
    public int authorCap() { return Math.max(1, authorCap); }
    public int explorationSlots() { return Math.min(2, Math.max(0, explorationSlots)); }
    public int anonymousCap() { return Math.max(0, anonymousCap); }
    public static boolean isEligible(Paste paste, Instant now) {
        return paste != null && paste.getVisibility() == Visibility.PUBLIC
                && paste.getModerationState() == ModerationState.ACTIVE && !paste.isBurnAfterReading()
                && paste.getPasswordHash() == null && paste.getEncryptionMode() == null
                && (paste.getExpiresAt() == null || paste.getExpiresAt().isAfter(now));
    }
}
