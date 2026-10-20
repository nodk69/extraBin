package com.pastebin.discovery.api;

import com.pastebin.discovery.api.dto.PublicAuthorProfileResponse;
import com.pastebin.discovery.application.AuthorProfileService;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.security.ClientIpResolver;
import com.pastebin.shared.security.RateLimiterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final ClientIpResolver clientIpResolver;
    private final int profileRateLimitMax;

    public PublicAuthorController(AuthorProfileService authorProfileService,
                                  RateLimiterService rateLimiterService,
                                  ClientIpResolver clientIpResolver,
                                  @Value("${app.discovery.profile-rate-limit-max:60}") int profileRateLimitMax) {
        this.authorProfileService = authorProfileService;
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
            HttpServletRequest request
    ) {
        enforceProfileRateLimit(request);
        return ResponseEntity.ok(authorProfileService.getPublicProfile(username));
    }

    @GetMapping("/{username}/pastes")
    @Operation(summary = "Public author work",
            description = "Server-side paginated listing of the author's eligible public pastes, newest first "
                    + "with a unique publicId tie-break. Applies the canonical discovery eligibility policy.")
    public ResponseEntity<PagedResponse<PasteSummaryResponse>> getAuthorPastes(
            @PathVariable("username") String username,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "18") int size,
            HttpServletRequest request
    ) {
        enforceProfileRateLimit(request);
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.min(Math.max(1, size), 50);
        return ResponseEntity.ok(authorProfileService.getPublicPastes(username, boundedPage, boundedSize));
    }

    private void enforceProfileRateLimit(HttpServletRequest request) {
        String clientIp = clientIpResolver.resolveClientIp(request);
        rateLimiterService.checkRateLimit("author-profile:ip:" + clientIp, profileRateLimitMax, 60);
    }
}
