package com.pastebin.discovery.api;

import com.pastebin.discovery.api.dto.PublicTagResponse;
import com.pastebin.discovery.application.DiscoveryService;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.security.ClientIpResolver;
import com.pastebin.shared.security.RateLimiterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/discovery")
@Tag(name = "Discovery", description = "Public feed, search, tags, and most-saved for eligible public pastes")
public class DiscoveryController {

    private static final Set<String> VALID_WINDOWS = Set.of("24h", "7d", "30d", "all");
    private static final Set<String> VALID_SORTS = Set.of("newest", "oldest", "updated");

    private final DiscoveryService discoveryService;
    private final RateLimiterService rateLimiterService;
    private final ClientIpResolver clientIpResolver;
    private final int searchRateLimitMax;

    public DiscoveryController(DiscoveryService discoveryService,
                               RateLimiterService rateLimiterService,
                               ClientIpResolver clientIpResolver,
                               @Value("${app.discovery.search-rate-limit-max:30}") int searchRateLimitMax) {
        this.discoveryService = discoveryService;
        this.rateLimiterService = rateLimiterService;
        this.clientIpResolver = clientIpResolver;
        this.searchRateLimitMax = searchRateLimitMax;
    }

    @GetMapping
    @Operation(summary = "Public paste discovery",
            description = "Returns eligible public pastes with optional search (q), tag, language, time window, and sort filters. "
                    + "Search and tag requests are rate limited per client IP.")
    public ResponseEntity<PagedResponse<PasteSummaryResponse>> getDiscoveryFeed(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @RequestParam(name = "language", required = false) String language,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "tag", required = false) String tag,
            @RequestParam(name = "window", required = false) String window,
            @RequestParam(name = "sort", required = false) String sort,
            HttpServletRequest request
    ) {
        validateFilters(q, tag, window, sort);

        if ((q != null && !q.isBlank()) || (tag != null && !tag.isBlank())) {
            String clientIp = clientIpResolver.resolveClientIp(request);
            rateLimiterService.checkRateLimit("discovery-search:ip:" + clientIp, searchRateLimitMax, 60);
        }

        int boundedPage = Math.max(0, page);
        int boundedSize = Math.min(Math.max(1, size), 50);
        PagedResponse<PasteSummaryResponse> response =
                discoveryService.getPublicPastes(language, q, tag, window, sort, boundedPage, boundedSize);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/tags")
    @Operation(summary = "Public tag cloud",
            description = "Returns the 50 most-used tags across eligible public pastes, ordered by paste count DESC then name ASC.")
    public ResponseEntity<List<PublicTagResponse>> getPublicTags() {
        return ResponseEntity.ok(discoveryService.getPublicTags());
    }

    @GetMapping("/most-saved")
    @Operation(summary = "Most-saved public pastes",
            description = "Returns eligible public pastes ordered by distinct save count DESC (ties by id ASC). Zero-save pastes are never included.")
    public ResponseEntity<PagedResponse<PasteSummaryResponse>> getMostSaved(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @RequestParam(name = "language", required = false) String language
    ) {
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.min(Math.max(1, size), 50);
        PagedResponse<PasteSummaryResponse> response =
                discoveryService.getMostSaved(language, boundedPage, boundedSize);
        return ResponseEntity.ok(response);
    }

    private void validateFilters(String q, String tag, String window, String sort) {
        if (q != null && q.length() > 200) {
            throw new BadRequestException("Search query must be at most 200 characters.");
        }
        if (tag != null && tag.length() > 50) {
            throw new BadRequestException("Tag filter must be at most 50 characters.");
        }
        if (window != null && !window.isBlank() && !VALID_WINDOWS.contains(window.toLowerCase(Locale.ROOT))) {
            throw new BadRequestException("Unknown time window. Valid values: 24h, 7d, 30d, all.");
        }
        if (sort != null && !sort.isBlank() && !VALID_SORTS.contains(sort.toLowerCase(Locale.ROOT))) {
            throw new BadRequestException("Unknown sort. Valid values: newest, oldest, updated.");
        }
    }
}
