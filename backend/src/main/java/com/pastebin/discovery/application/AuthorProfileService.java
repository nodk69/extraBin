package com.pastebin.discovery.application;

import com.pastebin.discovery.api.dto.PublicAuthorProfileResponse;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Public author reads.
 *
 * Every query applies {@link com.pastebin.paste.infrastructure.PasteQueries#ELIGIBLE_PUBLIC_PREDICATE}
 * verbatim, so a paste excluded from public discovery can never appear in a profile, a preview,
 * a listing, or an aggregate. Ownership is the persisted {@code pastes.user_id} relation; no
 * client-supplied identity is consulted.
 */
@Service
public class AuthorProfileService {

    /** Mirrors registration validation: usernames are 3-50 chars of letters, digits, _ or -. */
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{3,50}$");

    private static final Sort NEWEST_FIRST =
            Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.ASC, "publicId"));

    private static final int RECENT_WORK_LIMIT = 3;

    private final UserRepository userRepository;
    private final PasteRepository pasteRepository;
    private final PasteSummaryMapper summaryMapper;
    private final com.pastebin.identity.infrastructure.UserFollowRepository followRepository;

    public AuthorProfileService(UserRepository userRepository,
                                PasteRepository pasteRepository,
                                PasteSummaryMapper summaryMapper,
                                com.pastebin.identity.infrastructure.UserFollowRepository followRepository) {
        this.userRepository = userRepository;
        this.pasteRepository = pasteRepository;
        this.summaryMapper = summaryMapper;
        this.followRepository = followRepository;
    }

    /**
     * Summary and preview in one bounded payload: identity, eligible-public aggregates, and the
     * three most recent eligible public pastes. The profile page reuses this for its header.
     */
    @Transactional(readOnly = true)
    public PublicAuthorProfileResponse getPublicProfile(String username) {
        return getPublicProfile(username, null);
    }

    @Transactional(readOnly = true)
    public PublicAuthorProfileResponse getPublicProfile(String username, Long viewerId) {
        User user = requireUser(username);
        Instant now = Instant.now();

        List<Object[]> rows = pasteRepository.countEligiblePublicPastesByAuthor(user.getId(), now);
        Object[] stats = rows.isEmpty() ? null : rows.get(0);
        long publicPasteCount = stats == null ? 0L : toLong(stats[0]);
        long totalViews = stats == null ? 0L : toLong(stats[1]);
        long totalSaves = stats == null ? 0L : toLong(stats[2]);

        List<Paste> recent = pasteRepository.findRecentEligiblePublicPastesByAuthor(
                user.getId(), now, PageRequest.of(0, RECENT_WORK_LIMIT));
        List<PasteSummaryResponse> recentWork = summaryMapper.toAuthorSummaries(recent, user.getUsername());

        List<Paste> popular = pasteRepository.findPopularEligiblePublicPastesByAuthor(
                user.getId(), now, PageRequest.of(0, 2));
        List<PasteSummaryResponse> popularWork = summaryMapper.toAuthorSummaries(popular, user.getUsername());

        long languagesCount = pasteRepository.countDistinctLanguagesByAuthor(user.getId(), now);

        List<Object[]> langRows = pasteRepository.findTopLanguagesByAuthor(user.getId(), now, PageRequest.of(0, 3));
        List<String> topLanguages = langRows.stream()
                .map(r -> (String) r[0])
                .filter(l -> l != null && !l.isBlank())
                .toList();

        return new PublicAuthorProfileResponse(
                user.getUsername(),
                user.getDisplayName(),
                user.getBio(),
                user.getAvatarUrl(),
                user.getGithubUrl(),
                user.getLinkedinUrl(),
                user.getXUrl(),
                user.getCreatedAt(),
                publicPasteCount,
                totalViews,
                totalSaves,
                recentWork,
                popularWork,
                topLanguages,
                languagesCount,
                followRepository.countByFollowedId(user.getId()),
                followRepository.countByFollowerId(user.getId()),
                viewerId != null && !viewerId.equals(user.getId()) && followRepository.existsByFollowerIdAndFollowedId(viewerId, user.getId()));
    }

    /** Server-side paginated public work, supporting search query, language filter, and verified sort options with unique publicId tie-break. */
    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getPublicPastes(String username, int page, int size) {
        return getPublicPastes(username, null, null, null, page, size);
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getPublicPastes(String username, String q, String language, String sort, int page, int size) {
        User user = requireUser(username);
        String normLang = normalizeLanguage(language);
        String searchTerm = buildSearchTerm(q);
        Sort sortSpec = resolveSort(sort);

        Page<Paste> result = (normLang == null && searchTerm == null && sortSpec.equals(NEWEST_FIRST))
                ? pasteRepository.findEligiblePublicPastesByAuthor(user.getId(), Instant.now(), PageRequest.of(page, size, NEWEST_FIRST))
                : pasteRepository.findAuthorDiscoveryPastes(user.getId(), Instant.now(), normLang, searchTerm, PageRequest.of(page, size, sortSpec));

        List<PasteSummaryResponse> items = summaryMapper.toAuthorSummaries(result.getContent(), user.getUsername());
        return PagedResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    private Sort resolveSort(String sort) {
        Sort publicIdTieBreak = Sort.by(Sort.Direction.ASC, "publicId");
        String value = (sort == null || sort.isBlank()) ? "newest" : sort.toLowerCase(Locale.ROOT);
        return switch (value) {
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt").and(publicIdTieBreak);
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt").and(publicIdTieBreak);
            case "updated" -> Sort.by(Sort.Direction.DESC, "updatedAt").and(publicIdTieBreak);
            case "views", "most-viewed" -> Sort.by(Sort.Direction.DESC, "views").and(Sort.by(Sort.Direction.DESC, "createdAt")).and(publicIdTieBreak);
            case "stars", "most-starred", "saves", "most-saved" -> Sort.by(Sort.Direction.DESC, "starsCount").and(Sort.by(Sort.Direction.DESC, "createdAt")).and(publicIdTieBreak);
            case "title-asc", "title" -> Sort.by(Sort.Direction.ASC, "title").and(publicIdTieBreak);
            case "title-desc" -> Sort.by(Sort.Direction.DESC, "title").and(publicIdTieBreak);
            default -> Sort.by(Sort.Direction.DESC, "createdAt").and(publicIdTieBreak);
        };
    }

    private String normalizeLanguage(String language) {
        if (language == null || language.isBlank() || language.equalsIgnoreCase("all")) {
            return null;
        }
        return language.toLowerCase(Locale.ROOT).trim();
    }

    private String buildSearchTerm(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        String trimmed = q.trim().toLowerCase(Locale.ROOT);
        return trimmed.length() > 100 ? trimmed.substring(0, 100) : trimmed;
    }

    /**
     * Malformed usernames are a request error; valid-but-unknown and deleted accounts both produce
     * the identical 404 so the endpoint cannot be used to distinguish them.
     */
    private User requireUser(String username) {
        if (username == null || !USERNAME_PATTERN.matcher(username).matches()) {
            throw new BadRequestException(
                    "Invalid username. Usernames must be 3-50 characters using letters, digits, underscores, or hyphens.");
        }
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Author not found."));
    }

    private long toLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
