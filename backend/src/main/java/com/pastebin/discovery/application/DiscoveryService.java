package com.pastebin.discovery.application;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.pastebin.discovery.api.dto.PublicTagResponse;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.application.PublicListingChangedEvent;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.dto.PagedResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
public class DiscoveryService {

    private final PasteRepository pasteRepository;
    private final PasteSummaryMapper summaryMapper;
    private final com.pastebin.paste.infrastructure.PasteActivityEventRepository activityEventRepository;
    private final com.pastebin.discovery.infrastructure.meilisearch.MeilisearchIndexService meilisearchIndexService;

    private record TrendingEntry(long generation, PagedResponse<PasteSummaryResponse> response) {
    }

    // Holds only public-eligible summaries, keyed by bounded request parameters; never user-scoped.
    // Entries carry the invalidation generation they were loaded under so a load that raced an
    // invalidation can never be served.
    private final Cache<String, TrendingEntry> trendingCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(Duration.ofSeconds(60))
            .build();
    private final Cache<String, List<PublicTagResponse>> tagsCache = Caffeine.newBuilder()
            .maximumSize(10)
            .expireAfterWrite(Duration.ofMinutes(5))
            .build();
    private final ConcurrentHashMap<String, CompletableFuture<PagedResponse<PasteSummaryResponse>>> trendingLoads =
            new ConcurrentHashMap<>();
    private final AtomicLong trendingGeneration = new AtomicLong();
    private final TransactionTemplate readOnlyTransaction;
    private TrendingPolicy trendingPolicy = new TrendingPolicy();

    public DiscoveryService(PasteRepository pasteRepository,
                            PasteSummaryMapper summaryMapper,
                            com.pastebin.paste.infrastructure.PasteActivityEventRepository activityEventRepository) {
        this.pasteRepository = pasteRepository;
        this.summaryMapper = summaryMapper;
        this.activityEventRepository = activityEventRepository;
        this.meilisearchIndexService = null;
        this.readOnlyTransaction = null;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public DiscoveryService(PasteRepository pasteRepository,
                            PasteSummaryMapper summaryMapper,
                            com.pastebin.paste.infrastructure.PasteActivityEventRepository activityEventRepository,
                            org.springframework.beans.factory.ObjectProvider<com.pastebin.discovery.infrastructure.meilisearch.MeilisearchIndexService> meilisearchIndexServiceProvider,
                            PlatformTransactionManager transactionManager, TrendingPolicy trendingPolicy) {
        this.pasteRepository = pasteRepository;
        this.summaryMapper = summaryMapper;
        this.activityEventRepository = activityEventRepository;
        this.meilisearchIndexService = meilisearchIndexServiceProvider.getIfAvailable();
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setReadOnly(true);
        this.readOnlyTransaction = template;
        this.trendingPolicy = trendingPolicy;
    }

    /**
     * Not transactional: a cache hit must not borrow a pooled connection. Concurrent misses for the
     * same key share one load, which runs in its own read-only transaction.
     */
    public PagedResponse<PasteSummaryResponse> getTrending(String window, String language, int page, int size) {
        String normLang = normalizeLanguage(language);
        String normWindow = (window == null || window.isBlank()) ? "24h" : window.toLowerCase(Locale.ROOT);
        String cacheKey = normWindow + ":" + (normLang == null ? "all" : normLang) + ":" + page + ":" + size;

        while (true) {
            long generation = trendingGeneration.get();
            TrendingEntry cached = trendingCache.getIfPresent(cacheKey);
            if (cached != null && cached.generation() == generation) {
                return withoutExpired(cached.response(), trendingPolicy.now());
            }

            String flightKey = generation + "|" + cacheKey;
            CompletableFuture<PagedResponse<PasteSummaryResponse>> load = new CompletableFuture<>();
            CompletableFuture<PagedResponse<PasteSummaryResponse>> inFlight = trendingLoads.putIfAbsent(flightKey, load);
            if (inFlight != null) {
                var response = awaitLoad(inFlight);
                if (trendingGeneration.get() != generation) continue;
                return withoutExpired(response, trendingPolicy.now());
            }

            try {
                PagedResponse<PasteSummaryResponse> loaded = readOnlyTransaction == null
                        ? loadTrending(normWindow, normLang, page, size)
                        : readOnlyTransaction.execute(status -> loadTrending(normWindow, normLang, page, size));
                if (trendingGeneration.get() == generation) {
                    trendingCache.put(cacheKey, new TrendingEntry(generation, loaded));
                }
                load.complete(loaded);
                if (trendingGeneration.get() != generation) continue;
                return withoutExpired(loaded, trendingPolicy.now());
            } catch (RuntimeException | Error e) {
                load.completeExceptionally(e);
                throw e;
            } finally {
                trendingLoads.remove(flightKey, load);
            }
        }
    }

    private static PagedResponse<PasteSummaryResponse> awaitLoad(CompletableFuture<PagedResponse<PasteSummaryResponse>> load) {
        try {
            return load.join();
        } catch (CompletionException e) {
            if (e.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            if (e.getCause() instanceof Error error) {
                throw error;
            }
            throw e;
        }
    }

    // Expiry is time-driven with no write to hook, so it is enforced when serving.
    private static PagedResponse<PasteSummaryResponse> withoutExpired(PagedResponse<PasteSummaryResponse> response, Instant now) {
        List<PasteSummaryResponse> items = response.items();
        if (items.stream().noneMatch(item -> item.expiresAt() != null && !item.expiresAt().isAfter(now))) {
            return response;
        }
        List<PasteSummaryResponse> live = items.stream()
                .filter(item -> item.expiresAt() == null || item.expiresAt().isAfter(now))
                .toList();
        long removed = items.size() - live.size();
        return PagedResponse.of(live, response.page(), response.size(), Math.max(0, response.totalElements() - removed));
    }

    private PagedResponse<PasteSummaryResponse> loadTrending(String normWindow, String normLang, int page, int size) {
        Instant now = trendingPolicy.now();
        Instant windowStart = now.minus(trendingPolicy.window(normWindow));

        // Fetch top paste IDs and scores according to genuine activity in the window
        List<Object[]> rows = activityEventRepository.findTrendingPasteIdsAndScores(
                now, windowStart, normLang, PageRequest.of(page, size));

        List<PasteSummaryResponse> summaries;
        long totalElements;

        if (rows.isEmpty()) {
            // Fallback for cold system / new instances: return most recent eligible public pastes
            // rather than showing an empty state when activity events haven't accumulated yet.
            Page<Paste> fallback = pasteRepository.findDiscoveryPastes(
                    now, normLang, null, null, null,
                    PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.ASC, "publicId"))));
            summaries = summaryMapper.toSummaries(fallback.getContent());
            totalElements = fallback.getTotalElements();
        } else {
            List<Long> pasteIds = rows.stream().map(r -> (Long) r[0]).toList();
            Map<Long, Paste> pasteMap = pasteRepository.findAllById(pasteIds).stream()
                    .collect(Collectors.toMap(Paste::getId, p -> p));

            // Preserve deterministic trending rank order
            List<Paste> orderedPastes = new ArrayList<>();
            for (Long id : pasteIds) {
                Paste p = pasteMap.get(id);
                if (TrendingPolicy.isEligible(p, now)) {
                    orderedPastes.add(p);
                }
            }

            summaries = summaryMapper.toSummaries(orderedPastes);
            totalElements = activityEventRepository.countTrendingEligiblePastes(now, windowStart, normLang);
        }

        return PagedResponse.of(summaries, page, size, totalElements);
    }

    /**
     * Discards every cached Trending page, cached tag cloud, and any load already in flight,
     * so the next request reads committed state.
     */
    public void invalidateTrendingCache() {
        trendingGeneration.incrementAndGet();
        trendingCache.invalidateAll();
        tagsCache.invalidateAll();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onPublicListingChanged(PublicListingChangedEvent event) {
        invalidateTrendingCache();
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getPublicPastes(String language, String q, String tag,
                                                               String window, String sort,
                                                               int page, int size) {
        Instant now = Instant.now();
        Instant windowStart = resolveWindowStart(window, now);
        Sort sortSpec = resolveSort(sort);
        String normLang = normalizeLanguage(language);
        String normTag = normalizeTag(tag);
        String searchTerm = buildSearchTerm(q);

        // When search query 'q' is present and window/sort are default, route to Meilisearch if available
        if (searchTerm != null && !searchTerm.isBlank() && windowStart == null
                && meilisearchIndexService != null && meilisearchIndexService.isAvailable()) {
            var searchResult = meilisearchIndexService.search(searchTerm, normLang, normTag, page, size);
            if (!searchResult.isDegraded()) {
                List<String> hitIds = searchResult.getHitPublicIds();
                if (hitIds.isEmpty()) {
                    return PagedResponse.of(List.of(), page, size, 0);
                }

                // Authoritative single bounded batch query (EC-01..03, zero N+1 queries)
                List<Paste> eligiblePastes = pasteRepository.findEligiblePublicPastesByPublicIds(hitIds, now);
                Map<String, Paste> pasteMap = eligiblePastes.stream()
                        .collect(Collectors.toMap(Paste::getPublicId, p -> p));

                // Preserve deterministic Meilisearch relevance rank order while discarding stale/ineligible IDs
                List<Paste> orderedPastes = new ArrayList<>();
                for (String hitId : hitIds) {
                    Paste p = pasteMap.get(hitId);
                    if (p != null) {
                        orderedPastes.add(p);
                    }
                }

                List<PasteSummaryResponse> summaries = summaryMapper.toSummaries(orderedPastes);
                return PagedResponse.of(summaries, page, size, searchResult.getEstimatedTotalHits());
            }
            // If searchResult was degraded, fall through to PostgreSQL findDiscoveryPastes below
        }

        Page<Paste> result;
        if (normTag == null && searchTerm == null) {
            // Fast path: browse feed without tag/keyword joins or DISTINCT deduplication
            result = pasteRepository.findDefaultDiscoveryPastes(
                    now,
                    normLang,
                    windowStart,
                    PageRequest.of(page, size, sortSpec));
        } else {
            result = pasteRepository.findDiscoveryPastes(
                    now,
                    normLang,
                    normTag,
                    searchTerm,
                    windowStart,
                    PageRequest.of(page, size, sortSpec));
        }

        List<PasteSummaryResponse> summaries = summaryMapper.toSummaries(result.getContent());
        return PagedResponse.of(summaries, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<PublicTagResponse> getPublicTags() {
        List<PublicTagResponse> cached = tagsCache.getIfPresent("public_tags");
        if (cached != null) {
            return cached;
        }
        List<Object[]> rows = pasteRepository.countPublicTagUsage(Instant.now(), PageRequest.of(0, 50));
        List<PublicTagResponse> tags = rows.stream()
                .map(row -> new PublicTagResponse((String) row[0], (Long) row[1]))
                .toList();
        tagsCache.put("public_tags", tags);
        return tags;
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getMostSaved(String language, int page, int size) {
        Instant now = Instant.now();
        Sort sortSpec = Sort.by(Sort.Direction.DESC, "starsCount").and(Sort.by(Sort.Direction.ASC, "publicId"));

        Page<Paste> result = pasteRepository.findMostSavedPastes(
                now,
                normalizeLanguage(language),
                PageRequest.of(page, size, sortSpec));

        List<PasteSummaryResponse> summaries = summaryMapper.toSummaries(result.getContent());
        return PagedResponse.of(summaries, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    private Instant resolveWindowStart(String window, Instant now) {
        if (window == null || window.isBlank() || window.equalsIgnoreCase("all")) {
            return null;
        }
        return switch (window.toLowerCase(Locale.ROOT)) {
            case "24h" -> now.minus(Duration.ofHours(24));
            case "7d" -> now.minus(Duration.ofDays(7));
            case "30d" -> now.minus(Duration.ofDays(30));
            default -> null;
        };
    }

    private Sort resolveSort(String sort) {
        Sort publicIdTieBreak = Sort.by(Sort.Direction.ASC, "publicId");
        String value = (sort == null || sort.isBlank()) ? "newest" : sort.toLowerCase(Locale.ROOT);
        return switch (value) {
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt").and(publicIdTieBreak);
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt").and(publicIdTieBreak);
            case "updated" -> Sort.by(Sort.Direction.DESC, "updatedAt").and(publicIdTieBreak);
            default -> Sort.by(Sort.Direction.DESC, "createdAt").and(publicIdTieBreak);
        };
    }

    private String normalizeLanguage(String language) {
        if (language == null || language.isBlank() || language.equalsIgnoreCase("all")) {
            return null;
        }
        return language.toLowerCase(Locale.ROOT).trim();
    }

    private String normalizeTag(String tag) {
        if (tag == null || tag.isBlank()) {
            return null;
        }
        return tag.toLowerCase(Locale.ROOT).trim();
    }

    private String buildSearchTerm(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        return q.toLowerCase(Locale.ROOT).trim();
    }
}
