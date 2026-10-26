package com.pastebin;

import com.pastebin.discovery.application.DiscoveryService;
import com.pastebin.discovery.application.PasteSummaryMapper;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteActivityEventRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.dto.PagedResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Pageable;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * TC-U1..U2: Trending cache single-flight loading and invalidation-race safety.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("Trending cache concurrency")
class TrendingCacheConcurrencyUnitTest {

    @Mock
    private PasteActivityEventRepository activityEventRepository;
    @Mock
    private PasteRepository pasteRepository;
    @Mock
    private UserRepository userRepository;

    private DiscoveryService discoveryService;

    @BeforeEach
    void setUp() throws Exception {
        discoveryService = new DiscoveryService(pasteRepository, new PasteSummaryMapper(pasteRepository, userRepository),
                activityEventRepository);
        when(pasteRepository.findAllById(anyIterable())).thenAnswer(inv -> {
            List<Paste> out = new ArrayList<>();
            for (Object id : (Iterable<?>) inv.getArgument(0)) {
                out.add(paste((Long) id));
            }
            return out;
        });
        when(pasteRepository.findTagNamesByPasteIds(any())).thenReturn(Collections.emptyList());
        when(activityEventRepository.countTrendingEligiblePastes(any(), any(), any())).thenReturn(1L);
    }

    @Test
    @DisplayName("TC-U1: concurrent misses for one key run the trending aggregate exactly once")
    void concurrentColdMisses_loadOnce() throws Exception {
        AtomicInteger loads = new AtomicInteger();
        when(activityEventRepository.findTrendingPasteIdsAndScores(any(), any(), eq("java"), any(Pageable.class)))
                .thenAnswer(inv -> {
                    loads.incrementAndGet();
                    Thread.sleep(300);
                    return rows(1L);
                });

        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<PagedResponse<PasteSummaryResponse>>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return discoveryService.getTrending("24h", "java", 0, 20);
                }));
            }
            start.countDown();
            for (Future<PagedResponse<PasteSummaryResponse>> f : futures) {
                assertThat(f.get(10, TimeUnit.SECONDS).items()).extracting(PasteSummaryResponse::id).containsExactly("pub-1");
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(loads.get()).as("stampede: one load per key, all other callers wait for it").isEqualTo(1);
    }

    @Test
    @DisplayName("TC-U2: a load in flight when invalidation happens is never served afterwards")
    void invalidationDuringInFlightLoad_resultNotServed() throws Exception {
        CountDownLatch loaderEntered = new CountDownLatch(1);
        CountDownLatch releaseLoader = new CountDownLatch(1);
        AtomicInteger loads = new AtomicInteger();
        when(activityEventRepository.findTrendingPasteIdsAndScores(any(), any(), eq("go"), any(Pageable.class)))
                .thenAnswer(inv -> {
                    if (loads.incrementAndGet() == 1) {
                        loaderEntered.countDown();
                        releaseLoader.await(10, TimeUnit.SECONDS);
                        return rows(1L);
                    }
                    return rows(2L);
                });

        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<PagedResponse<PasteSummaryResponse>> inFlight =
                    pool.submit(() -> discoveryService.getTrending("24h", "go", 0, 20));
            assertThat(loaderEntered.await(10, TimeUnit.SECONDS)).isTrue();

            discoveryService.invalidateTrendingCache();
            releaseLoader.countDown();
            inFlight.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        PagedResponse<PasteSummaryResponse> after = discoveryService.getTrending("24h", "go", 0, 20);
        assertThat(after.items()).extracting(PasteSummaryResponse::id)
                .as("a snapshot read before invalidation must not repopulate the cache")
                .containsExactly("pub-2");
    }

    private static List<Object[]> rows(Long id) {
        List<Object[]> rows = new ArrayList<>();
        rows.add(new Object[]{id, 10.0});
        return rows;
    }

    private static Paste paste(Long id) throws Exception {
        Paste p = new Paste();
        set(p, "id", id);
        set(p, "publicId", "pub-" + id);
        set(p, "language", "java");
        set(p, "visibility", Visibility.PUBLIC);
        set(p, "title", "Paste " + id);
        set(p, "content", "x");
        set(p, "contentSizeBytes", 1);
        set(p, "lineCount", 1);
        set(p, "createdAt", Instant.now());
        set(p, "moderationState", ModerationState.ACTIVE);
        return p;
    }

    private static void set(Object target, String name, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }
}
