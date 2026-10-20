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

    public AuthorProfileService(UserRepository userRepository,
                                PasteRepository pasteRepository,
                                PasteSummaryMapper summaryMapper) {
        this.userRepository = userRepository;
        this.pasteRepository = pasteRepository;
        this.summaryMapper = summaryMapper;
    }

    /**
     * Summary and preview in one bounded payload: identity, eligible-public aggregates, and the
     * three most recent eligible public pastes. The profile page reuses this for its header.
     */
    @Transactional(readOnly = true)
    public PublicAuthorProfileResponse getPublicProfile(String username) {
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

        return new PublicAuthorProfileResponse(
                user.getUsername(),
                user.getCreatedAt(),
                publicPasteCount,
                totalViews,
                totalSaves,
                recentWork);
    }

    /** Server-side paginated public work, newest first with a unique publicId tie-break. */
    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getPublicPastes(String username, int page, int size) {
        User user = requireUser(username);
        Page<Paste> result = pasteRepository.findEligiblePublicPastesByAuthor(
                user.getId(), Instant.now(), PageRequest.of(page, size, NEWEST_FIRST));
        List<PasteSummaryResponse> items = summaryMapper.toAuthorSummaries(result.getContent(), user.getUsername());
        return PagedResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
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
