package com.pastebin.discovery.application;

import com.pastebin.discovery.api.dto.DeveloperRelationshipResponse;
import com.pastebin.discovery.api.dto.FollowingFeedResponse;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserFollowRepository;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.notification.application.NotificationService;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeveloperNetworkService {
    private static final int MAX_PAGE_SIZE = 50;
    private static final int MAX_CURSOR_LENGTH = 128;
    private final UserRepository users;
    private final UserFollowRepository follows;
    private final PasteRepository pastes;
    private final PasteSummaryMapper summaryMapper;
    private final NotificationService notifications;

    public DeveloperNetworkService(UserRepository users, UserFollowRepository follows, PasteRepository pastes,
                                   PasteSummaryMapper summaryMapper, NotificationService notifications) {
        this.users = users;
        this.follows = follows;
        this.pastes = pastes;
        this.summaryMapper = summaryMapper;
        this.notifications = notifications;
    }

    @Transactional
    public boolean follow(Long viewerId, String username) {
        User target = requireTarget(username);
        if (viewerId.equals(target.getId())) throw new BadRequestException("You cannot follow your own profile.");
        if (users.findById(viewerId).isEmpty()) throw new ResourceNotFoundException("Account not found.");
        int inserted = follows.insertIfAbsent(viewerId, target.getId(), Instant.now());
        if (inserted == 1 && target.isNotifyOnFollows()) notifications.notifyNewFollower(target, viewerId);
        return true;
    }

    @Transactional
    public boolean unfollow(Long viewerId, String username) {
        User target = requireTarget(username);
        if (viewerId.equals(target.getId())) throw new BadRequestException("You cannot unfollow your own profile.");
        follows.deleteRelationship(viewerId, target.getId());
        return false;
    }

    @Transactional(readOnly = true)
    public DeveloperRelationshipResponse relationship(String username, Long viewerId) {
        User target = requireTarget(username);
        return relationship(target, viewerId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<DeveloperRelationshipResponse> followers(String username, Long viewerId, int page, int size) {
        User target = requireTarget(username);
        PageRequest request = orderedPageRequest(page, size);
        List<Long> ids = follows.findFollowerIds(target.getId(), request);
        return pageRelationships(ids, follows.countByFollowedId(target.getId()), page, size, viewerId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<DeveloperRelationshipResponse> following(String username, Long viewerId, int page, int size) {
        User target = requireTarget(username);
        PageRequest request = orderedPageRequest(page, size);
        List<Long> ids = follows.findFollowingIds(target.getId(), request);
        return pageRelationships(ids, follows.countByFollowerId(target.getId()), page, size, viewerId);
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> followingFeed(Long viewerId, int page, int size) {
        PageRequest request = pageRequest(page, DiscoveryPagination.clampSize(size));
        Instant now = Instant.now();
        Page<Paste> result = pastes.findEligiblePublicPastesFromFollowedUsers(viewerId, now, request);
        return PagedResponse.of(summaryMapper.toSummaries(result.getContent()), result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public FollowingFeedResponse followingFeedCursor(Long viewerId, String cursor, int size) {
        Instant now = Instant.now();
        FeedCursor boundary = decodeFeedCursor(cursor, now);
        int boundedSize = DiscoveryPagination.clampSize(size);
        List<Paste> result = pastes.findEligiblePublicPastesFromFollowedUsersCursor(viewerId, now,
                boundary != null, boundary == null ? now : boundary.createdAt(),
                boundary == null ? "" : boundary.publicId(), PageRequest.of(0, boundedSize + 1));
        boolean hasMore = result.size() > boundedSize;
        List<Paste> items = hasMore ? result.subList(0, boundedSize) : result;
        String nextCursor = hasMore ? encodeFeedCursor(items.get(items.size() - 1)) : null;
        return new FollowingFeedResponse(summaryMapper.toSummaries(items), nextCursor, hasMore);
    }

    private FeedCursor decodeFeedCursor(String cursor, Instant now) {
        if (cursor == null) return null;
        if (cursor.length() > MAX_CURSOR_LENGTH || !cursor.matches("^[A-Za-z0-9_-]+$")) {
            throw new BadRequestException("Invalid following feed cursor.");
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(cursor);
            if (!Base64.getUrlEncoder().withoutPadding().encodeToString(decoded).equals(cursor)) {
                throw new BadRequestException("Invalid following feed cursor.");
            }
            String[] parts = new String(decoded, StandardCharsets.UTF_8).split("\n", -1);
            if (parts.length != 2
                    || !parts[0].matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]{1,9})?Z$")
                    || !parts[1].matches("^[A-Za-z0-9_-]{3,50}$")) {
                throw new BadRequestException("Invalid following feed cursor.");
            }
            Instant createdAt = Instant.parse(parts[0]);
            if (createdAt.isBefore(Instant.EPOCH) || createdAt.isAfter(now)) {
                throw new BadRequestException("Invalid following feed cursor.");
            }
            return new FeedCursor(createdAt, parts[1]);
        } catch (IllegalArgumentException | DateTimeParseException ex) {
            throw new BadRequestException("Invalid following feed cursor.");
        }
    }

    private String encodeFeedCursor(Paste paste) {
        String payload = paste.getCreatedAt().toString() + "\n" + paste.getPublicId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    private record FeedCursor(Instant createdAt, String publicId) {
    }

    @Transactional(readOnly = true)
    public PagedResponse<DeveloperRelationshipResponse> discoverDevelopers(Long viewerId, int page, int size) {
        Page<Long> idsPage = users.findDiscoverableDeveloperIds(viewerId, Instant.now(), orderedPageRequest(page, size));
        List<Long> ids = idsPage.getContent();
        if (ids.isEmpty()) return PagedResponse.of(List.of(), idsPage.getNumber(), idsPage.getSize(), idsPage.getTotalElements());
        Map<Long, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
        Set<Long> followedIds = viewerId == null ? Set.of() : new HashSet<>(follows.findFollowedIdsByViewerAmong(viewerId, ids));
        Map<Long, Long> followerCounts = follows.countFollowersForUsers(ids).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> ((Number) row[1]).longValue()));
        Map<Long, Long> followingCounts = follows.countFollowingForUsers(ids).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> ((Number) row[1]).longValue()));
        List<DeveloperRelationshipResponse> items = ids.stream().map(byId::get).filter(java.util.Objects::nonNull)
                .map(user -> relationship(user, followedIds.contains(user.getId()),
                        followerCounts.getOrDefault(user.getId(), 0L), followingCounts.getOrDefault(user.getId(), 0L)))
                .toList();
        return PagedResponse.of(items, idsPage.getNumber(), idsPage.getSize(), idsPage.getTotalElements());
    }

    private PagedResponse<DeveloperRelationshipResponse> pageRelationships(List<Long> ids, long total, int page, int size, Long viewerId) {
        if (ids.isEmpty()) return PagedResponse.of(List.of(), page, size, total);
        Map<Long, User> usersById = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
        Set<Long> viewerFollowing = viewerId == null ? Set.of() : new HashSet<>(follows.findFollowedIdsByViewerAmong(viewerId, ids));
        Map<Long, Long> followerCounts = follows.countFollowersForUsers(ids).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> ((Number) row[1]).longValue()));
        Map<Long, Long> followingCounts = follows.countFollowingForUsers(ids).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> ((Number) row[1]).longValue()));
        List<DeveloperRelationshipResponse> rows = new ArrayList<>();
        for (Long id : ids) {
            User user = usersById.get(id);
            if (user != null) rows.add(relationship(user, viewerFollowing.contains(id),
                    followerCounts.getOrDefault(id, 0L), followingCounts.getOrDefault(id, 0L)));
        }
        return PagedResponse.of(rows, page, size, total);
    }

    private DeveloperRelationshipResponse relationship(User user, Long viewerId) {
        boolean followedByViewer = viewerId != null && !viewerId.equals(user.getId())
                && follows.existsByFollowerIdAndFollowedId(viewerId, user.getId());
        return relationship(user, followedByViewer, follows.countByFollowedId(user.getId()), follows.countByFollowerId(user.getId()));
    }

    private DeveloperRelationshipResponse relationship(User user, boolean followedByViewer, long followerCount, long followingCount) {
        return new DeveloperRelationshipResponse(user.getUsername(), user.getCreatedAt(),
                followerCount, followingCount, followedByViewer);
    }

    private User requireTarget(String username) {
        if (username == null || !username.matches("^[A-Za-z0-9_-]{3,50}$")) throw new BadRequestException("Invalid username.");
        return users.findByUsername(username).orElseThrow(() -> new ResourceNotFoundException("Author not found."));
    }

    /** Sortable request for queries without a baked-in ORDER BY (the paste feed). */
    private PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "publicId")));
    }

    /**
     * Unsorted request for repositories whose @Query already carries a deterministic ORDER BY.
     * Spring Data appends a Pageable's sort to the declared query, and these queries project
     * scalar IDs (follow rows) or run natively (developer ranking), so their sort properties do
     * not exist on the projected type — passing a sort here produces invalid HQL/SQL.
     */
    private PageRequest orderedPageRequest(int page, int size) {
        return PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE));
    }
}
