package com.pastebin.paste.application;

import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.notification.application.NotificationService;
import com.pastebin.paste.api.dto.CreateReplyRequest;
import com.pastebin.paste.api.dto.EditReplyRequest;
import com.pastebin.paste.api.dto.RepliesCursorPageResponse;
import com.pastebin.paste.api.dto.ReplyResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Reply;
import com.pastebin.paste.domain.ReplyVote;
import com.pastebin.paste.domain.VoteType;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.infrastructure.ReplyRepository;
import com.pastebin.paste.infrastructure.ReplyVoteRepository;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import com.pastebin.shared.errors.UnauthorizedException;
import com.pastebin.shared.security.RateLimiterService;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReplyService {

    private final ReplyRepository replyRepository;
    private final ReplyVoteRepository replyVoteRepository;
    private final PasteRepository pasteRepository;
    private final UserRepository userRepository;
    private final RateLimiterService rateLimiterService;
    private final NotificationService notificationService;
    private final PasswordEncoder passwordEncoder;
    private final com.pastebin.discovery.application.PasteActivityIngestionService activity;
    private final org.springframework.context.ApplicationEventPublisher events;

    public ReplyService(
            ReplyRepository replyRepository,
            ReplyVoteRepository replyVoteRepository,
            PasteRepository pasteRepository,
            UserRepository userRepository,
            RateLimiterService rateLimiterService,
            NotificationService notificationService,
            PasswordEncoder passwordEncoder,
            com.pastebin.discovery.application.PasteActivityIngestionService activity,
            org.springframework.context.ApplicationEventPublisher events
    ) {
        this.replyRepository = replyRepository;
        this.replyVoteRepository = replyVoteRepository;
        this.pasteRepository = pasteRepository;
        this.userRepository = userRepository;
        this.rateLimiterService = rateLimiterService;
        this.notificationService = notificationService;
        this.passwordEncoder = passwordEncoder;
        this.activity = activity;
        this.events = events;
    }

    @Transactional
    public ReplyResponse createReply(String publicId, CreateReplyRequest request, Long authenticatedUserId, String clientIp) {
        return createReply(publicId, request, authenticatedUserId, clientIp, null);
    }

    @Transactional
    public ReplyResponse createReply(String publicId, CreateReplyRequest request, Long authenticatedUserId, String clientIp, String shareToken) {
        if (authenticatedUserId == null) {
            throw new UnauthorizedException("Authentication required to post a reply.");
        }

        // Rate limiting: 10 replies/min per user, 100/hour
        rateLimiterService.checkRateLimit("replies:user:" + authenticatedUserId + ":min", 10, 60);
        rateLimiterService.checkRateLimit("replies:user:" + authenticatedUserId + ":hour", 100, 3600);

        Paste paste = getPasteForReply(publicId, authenticatedUserId, shareToken);

        User author = userRepository.findById(authenticatedUserId)
                .orElseThrow(() -> new UnauthorizedException("User not found."));

        // Content validation and sanitization
        String rawContent = request.content() != null ? request.content().trim() : "";
        if (rawContent.isEmpty() || rawContent.length() > 5000) {
            throw new BadRequestException("Reply content must be between 1 and 5000 characters.");
        }
        String sanitizedContent = HtmlUtils.htmlEscape(rawContent);

        Reply parentReply = null;
        int depth = 0;

        if (request.parentReplyId() != null) {
            parentReply = replyRepository.findById(request.parentReplyId())
                    .orElseThrow(() -> new BadRequestException("Parent reply not found."));

            // Reject parent_reply_id that doesn't belong to same paste (400)
            if (!parentReply.getPaste().getId().equals(paste.getId())) {
                throw new BadRequestException("Parent reply does not belong to this paste.");
            }

            // Cap nesting at 5 levels (depth 0 through 4)
            depth = computeDepth(parentReply) + 1;
            if (depth > 4) {
                throw new BadRequestException("Replies cannot be nested deeper than 5 levels.");
            }
        }

        Reply reply = new Reply(paste, parentReply, author, sanitizedContent);
        Reply saved = replyRepository.save(reply);
        activity.recordReplyEvent(saved);

        // Notify relevant authors
        notificationService.notifyReplyCreated(paste, parentReply, saved, author);

        return mapToResponse(saved, authenticatedUserId, depth, Collections.emptyList(), Collections.emptyMap());
    }

    @Transactional(readOnly = true)
    public RepliesCursorPageResponse getReplies(String publicId, Long cursor, Integer limit, Long authenticatedUserId, String providedPassword) {
        return getReplies(publicId, cursor, limit, authenticatedUserId, providedPassword, null);
    }

    @Transactional(readOnly = true)
    public RepliesCursorPageResponse getReplies(String publicId, Long cursor, Integer limit, Long authenticatedUserId, String providedPassword, String shareToken) {
        Paste paste = pasteRepository.findByPublicId(publicId)
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        validatePasteAccess(paste, authenticatedUserId, providedPassword, shareToken);

        int pageSize = (limit != null && limit > 0) ? Math.min(limit, 50) : 20;

        // Fetch limit + 1 root replies to know if more exist
        List<Reply> rootReplies;
        if (cursor == null) {
            rootReplies = replyRepository.findRootRepliesInitial(paste.getId(), PageRequest.of(0, pageSize + 1));
        } else {
            rootReplies = replyRepository.findRootRepliesAfterCursor(paste.getId(), cursor, PageRequest.of(0, pageSize + 1));
        }

        boolean hasMore = rootReplies.size() > pageSize;
        List<Reply> pagedRoots = hasMore ? rootReplies.subList(0, pageSize) : rootReplies;

        Long nextCursor = null;
        if (!pagedRoots.isEmpty() && hasMore) {
            nextCursor = pagedRoots.get(pagedRoots.size() - 1).getId();
        }

        // Fetch children recursively for these root replies (up to 4 levels deep)
        Map<Long, List<Reply>> childrenByParent = new HashMap<>();
        Map<Long, Reply> allRepliesById = new HashMap<>();
        for (Reply root : pagedRoots) {
            allRepliesById.put(root.getId(), root);
        }

        if (!pagedRoots.isEmpty()) {
            List<Long> parentIds = pagedRoots.stream().map(Reply::getId).toList();
            for (int level = 0; level < 4; level++) {
                if (parentIds.isEmpty()) break;
                List<Reply> children = replyRepository.findChildrenByParentIds(parentIds);
                if (children.isEmpty()) break;
                for (Reply child : children) {
                    allRepliesById.put(child.getId(), child);
                }
                childrenByParent.putAll(
                    children.stream().collect(Collectors.groupingBy(c -> c.getParentReply().getId()))
                );
                parentIds = children.stream().map(Reply::getId).toList();
            }
        }

        // Compute user votes for all replies in the tree
        Map<Long, VoteType> userVotesByReplyId = new HashMap<>();
        if (authenticatedUserId != null && !allRepliesById.isEmpty()) {
            for (Long replyId : allRepliesById.keySet()) {
                replyVoteRepository.findByReplyIdAndUserId(replyId, authenticatedUserId)
                    .ifPresent(v -> userVotesByReplyId.put(replyId, v.getVoteType()));
            }
        }

        List<ReplyResponse> responseItems = pagedRoots.stream()
                .map(root -> buildReplyTree(root, authenticatedUserId, 0, childrenByParent, userVotesByReplyId))
                .toList();

        long totalCount = replyRepository.countTotalByPasteId(paste.getId());

        return new RepliesCursorPageResponse(responseItems, nextCursor, hasMore, totalCount);
    }

    @Transactional
    public ReplyResponse editReply(Long replyId, EditReplyRequest request, Long authenticatedUserId) {
        if (authenticatedUserId == null) {
            throw new UnauthorizedException("Authentication required to edit a reply.");
        }

        Reply reply = replyRepository.findById(replyId)
                .orElseThrow(() -> new ResourceNotFoundException("Reply not found."));

        if (!authenticatedUserId.equals(reply.getAuthor().getId())) {
            throw new ForbiddenException("You can only edit your own replies.");
        }

        if (reply.isDeleted()) {
            throw new BadRequestException("Cannot edit a deleted reply.");
        }

        String rawContent = request.content() != null ? request.content().trim() : "";
        if (rawContent.isEmpty() || rawContent.length() > 5000) {
            throw new BadRequestException("Reply content must be between 1 and 5000 characters.");
        }
        String sanitizedContent = HtmlUtils.htmlEscape(rawContent);

        reply.setContent(sanitizedContent);
        Reply updated = replyRepository.save(reply);

        int depth = computeDepth(updated);
        return mapToResponse(updated, authenticatedUserId, depth, Collections.emptyList(), Collections.emptyMap());
    }

    @Transactional
    public void deleteReply(Long replyId, Long authenticatedUserId) {
        if (authenticatedUserId == null) {
            throw new UnauthorizedException("Authentication required to delete a reply.");
        }

        Reply reply = replyRepository.findById(replyId)
                .orElseThrow(() -> new ResourceNotFoundException("Reply not found."));

        if (!authenticatedUserId.equals(reply.getAuthor().getId())) {
            throw new ForbiddenException("You can only delete your own replies.");
        }

        // Soft delete: keep thread structure and show [deleted]
        reply.setDeleted(true);
        replyRepository.save(reply);
        events.publishEvent(new PublicListingChangedEvent());
    }

    private Paste getPasteForReply(String publicId, Long authenticatedUserId, String shareToken) {
        Paste paste = pasteRepository.findByPublicId(publicId)
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        // Reject replies on expired/private pastes (403)
        if (paste.getExpiresAt() != null && paste.getExpiresAt().isBefore(Instant.now())) {
            throw new ForbiddenException("Cannot reply to an expired paste.");
        }

        if (paste.isBurnAfterReading()) {
            throw new ForbiddenException("Replies are not allowed on view-once pastes.");
        }

        boolean isOwner = authenticatedUserId != null && authenticatedUserId.equals(paste.getUserId());

        if (paste.getVisibility() == Visibility.PRIVATE) {
            if (!isOwner) {
                throw new ForbiddenException("Cannot reply to a private paste.");
            }
        }

        if (paste.getVisibility() == Visibility.UNLISTED && !isOwner) {
            com.pastebin.paste.domain.ShareAccessState state = paste.getShareAccessState();
            if (state == com.pastebin.paste.domain.ShareAccessState.REVOKED) {
                throw new ResourceNotFoundException("Paste not found or has expired.");
            }
            if (state == com.pastebin.paste.domain.ShareAccessState.ACTIVE) {
                if (shareToken == null || !com.pastebin.paste.domain.ShareTokenUtil.verifyToken(shareToken, paste.getShareTokenHash())) {
                    throw new ResourceNotFoundException("Paste not found or has expired.");
                }
            }
            // If LEGACY_OPEN, access permitted without token
        }

        return paste;
    }

    private void validatePasteAccess(Paste paste, Long authenticatedUserId, String providedPassword, String shareToken) {
        if (paste.getExpiresAt() != null && paste.getExpiresAt().isBefore(Instant.now())) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        boolean isOwner = authenticatedUserId != null && authenticatedUserId.equals(paste.getUserId());

        if (paste.getVisibility() == Visibility.PRIVATE) {
            if (!isOwner) {
                throw new ResourceNotFoundException("Paste not found or has expired.");
            }
        }

        if (paste.getVisibility() == Visibility.UNLISTED && !isOwner) {
            com.pastebin.paste.domain.ShareAccessState state = paste.getShareAccessState();
            if (state == com.pastebin.paste.domain.ShareAccessState.REVOKED) {
                throw new ResourceNotFoundException("Paste not found or has expired.");
            }
            if (state == com.pastebin.paste.domain.ShareAccessState.ACTIVE) {
                if (shareToken == null || !com.pastebin.paste.domain.ShareTokenUtil.verifyToken(shareToken, paste.getShareTokenHash())) {
                    throw new ResourceNotFoundException("Paste not found or has expired.");
                }
            }
            // If LEGACY_OPEN, access permitted without token
        }

        if (paste.isPasswordProtected()) {
            if (!isOwner) {
                if (providedPassword == null || providedPassword.isBlank() ||
                        !passwordEncoder.matches(providedPassword.trim(), paste.getPasswordHash())) {
                    throw new UnauthorizedException("Password required to view replies on this paste.");
                }
            }
        }
    }

    private ReplyResponse buildReplyTree(Reply reply, Long currentUserId, int depth,
                                          Map<Long, List<Reply>> childrenByParent,
                                          Map<Long, VoteType> userVotesByReplyId) {
        List<Reply> children = childrenByParent.getOrDefault(reply.getId(), Collections.emptyList());
        List<ReplyResponse> childResponses = children.stream()
                .map(child -> buildReplyTree(child, currentUserId, depth + 1, childrenByParent, userVotesByReplyId))
                .toList();
        return mapToResponse(reply, currentUserId, depth, childResponses, userVotesByReplyId);
    }

    private int computeDepth(Reply reply) {
        int depth = 0;
        Reply current = reply;
        while (current.getParentReply() != null) {
            depth++;
            current = current.getParentReply();
        }
        return depth;
    }

    private ReplyResponse mapToResponse(Reply reply, Long currentUserId, int depth,
                                         List<ReplyResponse> children,
                                         Map<Long, VoteType> userVotesByReplyId) {
        boolean isAuthor = currentUserId != null && currentUserId.equals(reply.getAuthor().getId());
        String displayContent = reply.isDeleted() ? "[deleted]" : reply.getContent();
        VoteType userVote = userVotesByReplyId.get(reply.getId());

        return new ReplyResponse(
                reply.getId(),
                reply.getPaste().getPublicId(),
                reply.getParentReply() != null ? reply.getParentReply().getId() : null,
                reply.getAuthor().getId(),
                reply.isDeleted() ? "[deleted]" : reply.getAuthor().getUsername(),
                displayContent,
                reply.isDeleted(),
                isAuthor,
                depth,
                reply.getUpvotes(),
                reply.getDownvotes(),
                userVote,
                reply.getCreatedAt(),
                reply.getUpdatedAt(),
                children
        );
    }
}
