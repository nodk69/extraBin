package com.pastebin;

import com.pastebin.shared.errors.RateLimitExceededException;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Bounded Rate Limiter & Concurrency Tests (SEC-02, SEC-13)")
class RateLimiterServiceTest {

    private RateLimiterService rateLimiterService;

    @BeforeEach
    void setUp() {
        rateLimiterService = new RateLimiterService();
    }

    @Test
    @DisplayName("Permits requests within threshold")
    void permitsRequestsWithinLimit() {
        String key = "test:user1";
        for (int i = 0; i < 5; i++) {
            rateLimiterService.checkRateLimit(key, 5, 60);
        }
    }

    @Test
    @DisplayName("Throws RateLimitExceededException when limit exceeded")
    void throwsWhenLimitExceeded() {
        String key = "test:user2";
        for (int i = 0; i < 3; i++) {
            rateLimiterService.checkRateLimit(key, 3, 60);
        }

        assertThatThrownBy(() -> rateLimiterService.checkRateLimit(key, 3, 60))
                .isInstanceOf(RateLimitExceededException.class)
                .hasMessageContaining("Rate limit exceeded");
    }

    @Test
    @DisplayName("Isolates different keys from each other")
    void isolatesDifferentKeys() {
        String keyA = "test:clientA";
        String keyB = "test:clientB";

        for (int i = 0; i < 3; i++) {
            rateLimiterService.checkRateLimit(keyA, 3, 60);
        }

        // keyA is exhausted
        assertThatThrownBy(() -> rateLimiterService.checkRateLimit(keyA, 3, 60))
                .isInstanceOf(RateLimitExceededException.class);

        // keyB has independent quota
        rateLimiterService.checkRateLimit(keyB, 3, 60);
    }

    @Test
    @DisplayName("Handles high concurrency across threads without corruption (SEC-13)")
    void handlesHighConcurrencyAcrossThreads() throws InterruptedException {
        int threads = 10;
        int requestsPerThread = 20;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);
        AtomicInteger successfulRequests = new AtomicInteger(0);
        AtomicInteger rejectedRequests = new AtomicInteger(0);

        String sharedKey = "test:concurrent";
        int totalLimit = 50;

        for (int i = 0; i < threads; i++) {
            executor.submit(() -> {
                try {
                    for (int j = 0; j < requestsPerThread; j++) {
                        try {
                            rateLimiterService.checkRateLimit(sharedKey, totalLimit, 60);
                            successfulRequests.incrementAndGet();
                        } catch (RateLimitExceededException e) {
                            rejectedRequests.incrementAndGet();
                        }
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executor.shutdown();

        // Exactly totalLimit requests must succeed, the rest must be cleanly rejected
        assertThat(successfulRequests.get()).isEqualTo(totalLimit);
        assertThat(rejectedRequests.get()).isEqualTo((threads * requestsPerThread) - totalLimit);
    }

    @Test
    @DisplayName("Bounded memory allocation tracking (SEC-02)")
    void boundedMemoryAllocation() {
        // Track many distinct keys
        for (int i = 0; i < 100; i++) {
            rateLimiterService.checkRateLimit("ip:" + i, 5, 60);
        }
        assertThat(rateLimiterService.size()).isGreaterThanOrEqualTo(100);

        rateLimiterService.clear();
        assertThat(rateLimiterService.size()).isEqualTo(0);
    }
}
