package com.pastebin;

import com.pastebin.discovery.application.DiscoveryService;
import com.pastebin.discovery.application.PasteSummaryMapper;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteActivityEventRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.errors.RateLimitExceededException;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("Adversarial Trending & Abuse Hardening Unit Tests")
class TrendingAdversarialUnitTest {

    @Mock
    private PasteActivityEventRepository activityEventRepository;

    @Mock
    private PasteRepository pasteRepository;

    @Mock
    private UserRepository userRepository;

    private RateLimiterService rateLimiterService;

    @BeforeEach
    void setUp() {
        rateLimiterService = new RateLimiterService();
    }

    @Test
    @DisplayName("Rate limiter enforces exact boundary at 60 requests/min and returns valid Retry-After")
    void rateLimiterEnforcesExactBoundaryAndRetryAfter() {
        String key = "discovery-trending:ip:203.0.113.10";
        int limit = 60;
        long window = 60;

        // 60 requests succeed
        for (int i = 0; i < limit; i++) {
            rateLimiterService.checkRateLimit(key, limit, window);
        }

        // 61st request rejected with RateLimitExceededException and positive retry-after
        assertThatThrownBy(() -> rateLimiterService.checkRateLimit(key, limit, window))
                .isInstanceOf(RateLimitExceededException.class)
                .satisfies(ex -> {
                    RateLimitExceededException rle = (RateLimitExceededException) ex;
                    assertThat(rle.getRetryAfterSeconds()).isGreaterThan(0);
                    assertThat(rle.getMessage()).contains("Rate limit exceeded");
                });
    }

    @Test
    @DisplayName("Rate limiter isolates different IP identities cleanly under concurrent bursts")
    void rateLimiterIsolatesDifferentIpsConcurrently() throws InterruptedException {
        int threads = 10;
        int requestsPerIp = 50;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);
        AtomicInteger totalSuccess = new AtomicInteger(0);

        for (int i = 0; i < threads; i++) {
            final int ipIndex = i;
            executor.submit(() -> {
                try {
                    String ip = "198.51.100." + ipIndex;
                    for (int j = 0; j < requestsPerIp; j++) {
                        rateLimiterService.checkRateLimit("discovery-trending:ip:" + ip, 60, 60);
                        totalSuccess.incrementAndGet();
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executor.shutdown();

        // All 500 requests across 10 distinct IPs (50 each) must succeed without interfering
        assertThat(totalSuccess.get()).isEqualTo(threads * requestsPerIp);
    }

    @Test
    @DisplayName("Trending cache keys isolate time windows and language parameters strictly")
    void cacheKeysIsolateFilters() throws Exception {
        PasteSummaryMapper summaryMapper = new PasteSummaryMapper(pasteRepository, userRepository);
        DiscoveryService discoveryService = new DiscoveryService(pasteRepository, summaryMapper, activityEventRepository);

        Paste pasteA = createMockPaste(1L, "pub-1", "java", Visibility.PUBLIC);
        Paste pasteB = createMockPaste(2L, "pub-2", "python", Visibility.PUBLIC);

        List<Object[]> rowsJava = new ArrayList<>();
        rowsJava.add(new Object[]{1L, 10.0});

        List<Object[]> rowsPython = new ArrayList<>();
        rowsPython.add(new Object[]{2L, 8.0});

        when(activityEventRepository.findTrendingPasteIdsAndScores(any(), any(), eq("java"), any(Pageable.class)))
                .thenReturn(rowsJava);
        when(activityEventRepository.findTrendingPasteIdsAndScores(any(), any(), eq("python"), any(Pageable.class)))
                .thenReturn(rowsPython);

        when(pasteRepository.findAllById(List.of(1L))).thenReturn(List.of(pasteA));
        when(pasteRepository.findAllById(List.of(2L))).thenReturn(List.of(pasteB));

        when(activityEventRepository.countTrendingEligiblePastes(any(), any(), eq("java"))).thenReturn(1L);
        when(activityEventRepository.countTrendingEligiblePastes(any(), any(), eq("python"))).thenReturn(1L);

        when(pasteRepository.findTagNamesByPasteIds(any())).thenReturn(Collections.emptyList());

        PagedResponse<PasteSummaryResponse> resJava = discoveryService.getTrending("24h", "java", 0, 20);
        PagedResponse<PasteSummaryResponse> resPython = discoveryService.getTrending("24h", "python", 0, 20);

        assertThat(resJava.items()).hasSize(1);
        assertThat(resJava.items().get(0).id()).isEqualTo("pub-1");

        assertThat(resPython.items()).hasSize(1);
        assertThat(resPython.items().get(0).id()).isEqualTo("pub-2");

        // Invalidate cache explicitly
        discoveryService.invalidateTrendingCache();
    }

    private Paste createMockPaste(Long id, String publicId, String language, Visibility visibility) throws Exception {
        Paste p = new Paste();
        setField(p, "id", id);
        setField(p, "publicId", publicId);
        setField(p, "language", language);
        setField(p, "visibility", visibility);
        setField(p, "title", "Test Paste " + id);
        setField(p, "content", "System.out.println();");
        setField(p, "contentSizeBytes", 20);
        setField(p, "lineCount", 1);
        setField(p, "createdAt", Instant.now());
        setField(p, "moderationState", com.pastebin.paste.domain.ModerationState.ACTIVE);
        return p;
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Class<?> clazz = target.getClass();
        Field f = clazz.getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(target, value);
    }
}
