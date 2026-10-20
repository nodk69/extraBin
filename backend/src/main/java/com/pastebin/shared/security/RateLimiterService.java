package com.pastebin.shared.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.pastebin.shared.errors.RateLimitExceededException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * High-performance, bounded sliding window rate limiter service.
 * Defends against memory exhaustion (SEC-02) and thread synchronization contention (SEC-13)
 * using a Caffeine bounded cache with LRU eviction and time-based expiration.
 */
@Service
public class RateLimiterService {

    // Cap maximum entries to 50,000 to prevent heap exhaustion (DoS) and evict entries after 1 hour of inactivity
    private final Cache<String, Deque<Long>> cache = Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterAccess(Duration.ofHours(1))
            .build();

    /**
     * Checks rate limit using sliding window counter with atomic per-key computation.
     *
     * @param key Unique key (e.g., "create:" + clientIp or "login:" + clientIp)
     * @param maxRequests Maximum requests allowed in the window
     * @param windowSeconds Window duration in seconds
     */
    public void checkRateLimit(String key, int maxRequests, long windowSeconds) {
        long now = Instant.now().toEpochMilli();
        long windowStart = now - (windowSeconds * 1000);

        // Atomic per-key computation eliminating the global synchronized monitor bottleneck
        cache.asMap().compute(key, (k, timestamps) -> {
            if (timestamps == null) {
                timestamps = new ArrayDeque<>();
            }

            // Purge expired timestamps from the sliding window
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }

            if (timestamps.size() >= maxRequests) {
                long earliest = timestamps.peekFirst();
                long retryAfterSeconds = Math.max(1, (earliest + (windowSeconds * 1000) - now) / 1000);
                throw new RateLimitExceededException(
                        "Rate limit exceeded. Please wait " + retryAfterSeconds + " seconds before trying again.",
                        retryAfterSeconds
                );
            }

            timestamps.addLast(now);
            return timestamps;
        });
    }

    /**
     * Clear all rate limits (useful for isolated testing).
     */
    public void clear() {
        cache.invalidateAll();
    }

    /**
     * Current size of active tracked rate limit keys (for testing and observability).
     */
    public long size() {
        return cache.estimatedSize();
    }
}
