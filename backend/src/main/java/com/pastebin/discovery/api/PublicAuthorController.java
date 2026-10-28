package com.pastebin.discovery.api;

import com.pastebin.discovery.api.dto.FollowingFeedResponse;
import com.pastebin.discovery.api.dto.PublicAuthorProfileResponse;
import com.pastebin.discovery.application.AuthorProfileService;
import com.pastebin.discovery.application.DeveloperNetworkService;
import com.pastebin.discovery.application.DiscoveryPagination;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.shared.errors.UnauthorizedException;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.security.ClientIpResolver;
import com.pastebin.shared.security.RateLimiterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public author endpoints. Lives under the existing {@code /api/v1/discovery/**} security matcher
 * so it inherits the exact anonymous-read policy of public discovery instead of opening a new
 * matcher surface.
 */
@RestController
@RequestMapping("/api/v1/discovery/authors")
@Tag(name = "Discovery", description = "Public feed, search, tags, author profiles, and most-saved for eligible public pastes")
public class PublicAuthorController {

    private final AuthorProfileService authorProfileService;
    private final RateLimiterService rateLimiterService;
    private final DeveloperNetworkService developerNetworkService;
    private final ClientIpResolver clientIpResolver;
    private final int profileRateLimitMax;

    public PublicAuthorController(AuthorProfileService authorProfileService,
                                  DeveloperNetworkService developerNetworkService,
                                  RateLimiterService rateLimiterService,
                                  ClientIpResolver clientIpResolver,
                                  @Value("${app.discovery.profile-rate-limit-max:60}") int profileRateLimitMax) {
        this.authorProfileService = authorProfileService;
        this.developerNetworkService = developerNetworkService;
        this.rateLimiterService = rateLimiterService;
        this.clientIpResolver = clientIpResolver;
        this.profileRateLimitMax = profileRateLimitMax;
    }

    @GetMapping("/{username}")
    @Operation(summary = "Public author profile",
            description = "Returns the public username, joined date, eligible public aggregate counts, and up to "
                    + "three recent eligible public pastes. Applies the canonical discovery eligibility policy. "
                    + "Requests are rate limited per client IP.")
    public ResponseEntity<PublicAuthorProfileResponse> getAuthorProfile(
            @PathVariable("username") String username,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest request
    ) {
        enforceProfileRateLimit(request);
        Long viewerId = principal instanceof PastebinUserPrincipal user ? user.getId() : null;
        return ResponseEntity.ok(authorProfileService.getPublicProfile(username, viewerId));
    }

    @GetMapping("/{username}/pastes")
    @Operation(summary = "Public author work",
            description = "Server-side paginated listing of the author's eligible public pastes with search, language filtering, and sorting. "
                    + "Applies the canonical discovery eligibility policy.")
    public ResponseEntity<PagedResponse<PasteSummaryResponse>> getAuthorPastes(
            @PathVariable("username") String username,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "language", required = false) String language,
            @RequestParam(name = "sort", required = false) String sort,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "18") int size,
            HttpServletRequest request
    ) {
        enforceProfileRateLimit(request);
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.min(Math.max(1, size), 50);
        return ResponseEntity.ok(authorProfileService.getPublicPastes(username, q, language, sort, boundedPage, boundedSize));
    }

    @PostMapping("/{username}/follow")
    public ResponseEntity<Void> follow(@PathVariable String username, @AuthenticationPrincipal Object principal) {
        developerNetworkService.follow(requireViewerId(principal), username);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{username}/follow")
    public ResponseEntity<Void> unfollow(@PathVariable String username, @AuthenticationPrincipal Object principal) {
        developerNetworkService.unfollow(requireViewerId(principal), username);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{username}/followers")
    public ResponseEntity<PagedResponse<com.pastebin.discovery.api.dto.DeveloperRelationshipResponse>> followers(
            @PathVariable String username, @AuthenticationPrincipal Object principal,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        Long viewerId = principal instanceof PastebinUserPrincipal user ? user.getId() : null;
        return ResponseEntity.ok(developerNetworkService.followers(username, viewerId, Math.max(0, page), Math.min(Math.max(1, size), 50)));
    }

    @GetMapping("/{username}/following")
    public ResponseEntity<PagedResponse<com.pastebin.discovery.api.dto.DeveloperRelationshipResponse>> following(
            @PathVariable String username, @AuthenticationPrincipal Object principal,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        Long viewerId = principal instanceof PastebinUserPrincipal user ? user.getId() : null;
        return ResponseEntity.ok(developerNetworkService.following(username, viewerId, Math.max(0, page), Math.min(Math.max(1, size), 50)));
    }

    @GetMapping("/developers")
    public ResponseEntity<PagedResponse<com.pastebin.discovery.api.dto.DeveloperRelationshipResponse>> discoverDevelopers(
            @AuthenticationPrincipal Object principal, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Long viewerId = principal instanceof PastebinUserPrincipal user ? user.getId() : null;
        return ResponseEntity.ok(developerNetworkService.discoverDevelopers(viewerId,
                Math.max(0, page), Math.min(Math.max(1, size), 50)));
    }

    @GetMapping("/following/feed")
    public ResponseEntity<PagedResponse<PasteSummaryResponse>> followingFeed(
            @AuthenticationPrincipal Object principal, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = DiscoveryPagination.DEFAULT_PAGE_SIZE) int size) {
        return ResponseEntity.ok(developerNetworkService.followingFeed(requireViewerId(principal), Math.max(0, page), DiscoveryPagination.clampSize(size)));
    }

    @GetMapping("/following/feed/cursor")
    @Operation(summary = "Following feed with cursor pagination",
            description = "Requires authentication. Returns up to eight eligible public pastes from currently followed authors, without a total count.")
    public ResponseEntity<FollowingFeedResponse> followingFeedCursor(
            @AuthenticationPrincipal Object principal,
            @RequestParam(name = "cursor", required = false) String cursor,
            @RequestParam(defaultValue = DiscoveryPagination.DEFAULT_PAGE_SIZE) int size) {
        return ResponseEntity.ok(developerNetworkService.followingFeedCursor(requireViewerId(principal), cursor, DiscoveryPagination.clampSize(size)));
    }

    private Long requireViewerId(Object principal) {
        if (principal instanceof PastebinUserPrincipal user) return user.getId();
        throw new UnauthorizedException("Authentication required.");
    }

    private void enforceProfileRateLimit(HttpServletRequest request) {
        String clientIp = clientIpResolver.resolveClientIp(request);
        rateLimiterService.checkRateLimit("author-profile:ip:" + clientIp, profileRateLimitMax, 60);
    }
}
