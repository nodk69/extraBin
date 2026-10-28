package com.pastebin.paste.application;

import com.pastebin.paste.api.dto.CommentResponse;
import com.pastebin.paste.api.dto.CommentsListResponse;
import com.pastebin.paste.api.dto.CreateCommentRequest;
import com.pastebin.paste.api.dto.CreateCommentResponse;
import com.pastebin.paste.domain.DeletionCapabilityUtil;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteComment;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteCommentRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import com.pastebin.shared.security.RateLimiterService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class PasteCommentService {

    public static final int MAX_COMMENT_LENGTH = 2000;

    private final PasteRepository pasteRepository;
    private final PasteCommentRepository pasteCommentRepository;
    private final RateLimiterService rateLimiterService;
    private final PasteService pasteService;
    private final com.pastebin.discovery.application.PasteActivityIngestionService activity;
    private final org.springframework.context.ApplicationEventPublisher events;

    public PasteCommentService(PasteRepository pasteRepository,
                               PasteCommentRepository pasteCommentRepository,
                               RateLimiterService rateLimiterService,
                               PasteService pasteService,
                               com.pastebin.discovery.application.PasteActivityIngestionService activity,
                               org.springframework.context.ApplicationEventPublisher events) {
        this.pasteRepository = pasteRepository;
        this.pasteCommentRepository = pasteCommentRepository;
        this.rateLimiterService = rateLimiterService;
        this.pasteService = pasteService;
        this.activity = activity;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public CommentsListResponse getComments(String publicId,
                                            Long currentUserId,
                                            String userRole,
                                            String providedPassword,
                                            String clientIp) {
        Paste paste = pasteService.getActivePasteWithAccess(publicId, currentUserId, providedPassword, clientIp);

        if (paste.getVisibility() != Visibility.PUBLIC) {
            throw new BadRequestException("Comments are only available for public pastes.");
        }

        if (paste.isEncrypted()) {
            throw new BadRequestException("Comments are not supported on encrypted pastes.");
        }

        List<PasteComment> comments = pasteCommentRepository.findByPasteIdOrderByCreatedAtAsc(paste.getId());

        List<CommentResponse> commentResponses = comments.stream()
                .map(comment -> {
                    boolean isPasteAuthor = comment.getUserId() != null && comment.getUserId().equals(paste.getUserId());
                    boolean isAuthenticatedUser = comment.getUserId() != null;
                    boolean canDelete = false;

                    if (currentUserId != null) {
                        canDelete = currentUserId.equals(paste.getUserId())
                                || currentUserId.equals(comment.getUserId())
                                || "ROLE_ADMIN".equals(userRole);
                    }

                    return new CommentResponse(
                            comment.getId(),
                            publicId,
                            comment.getAuthorName(),
                            comment.getContent(),
                            isPasteAuthor,
                            isAuthenticatedUser,
                            canDelete,
                            comment.getCreatedAt()
                    );
                })
                .toList();

        return new CommentsListResponse(publicId, commentResponses.size(), commentResponses);
    }

    @Transactional
    public CreateCommentResponse addComment(String publicId,
                                            CreateCommentRequest request,
                                            Long currentUserId,
                                            String currentUsername,
                                            String providedPassword,
                                            String clientIp) {
        if (request == null || request.content() == null || request.content().isBlank()) {
            throw new BadRequestException("Comment content must not be blank.");
        }

        String trimmedContent = request.content().trim().replace("\u0000", "");
        if (trimmedContent.isEmpty()) {
            throw new BadRequestException("Comment content must not be blank.");
        }

        if (trimmedContent.length() > MAX_COMMENT_LENGTH) {
            throw new BadRequestException("Comment must be at most " + MAX_COMMENT_LENGTH + " characters.");
        }

        Paste paste = pasteService.getActivePasteWithAccess(publicId, currentUserId, providedPassword, clientIp);

        if (paste.getVisibility() != Visibility.PUBLIC) {
            throw new BadRequestException("Comments are only permitted on public pastes.");
        }

        if (paste.isBurnAfterReading()) {
            throw new BadRequestException("Comments cannot be added to burn-after-reading pastes.");
        }

        if (paste.isEncrypted()) {
            throw new BadRequestException("Comments cannot be added to encrypted pastes.");
        }

        // Rate limiting
        String ipKey = (clientIp != null && !clientIp.isBlank()) ? clientIp : "127.0.0.1";
        String burstKey = (currentUserId != null) ? "comment:burst:u:" + currentUserId : "comment:burst:ip:" + ipKey;
        rateLimiterService.checkRateLimit(burstKey, 2, 5);

        if (currentUserId == null) {
            rateLimiterService.checkRateLimit("comment:ip:" + ipKey, 15, 3600);
        } else {
            rateLimiterService.checkRateLimit("comment:user:" + currentUserId, 40, 3600);
        }

        String authorName;
        Long userId;
        String rawDeletionCapability = null;
        String deletionCapabilityHash = null;

        if (currentUserId != null) {
            userId = currentUserId;
            authorName = (currentUsername != null && !currentUsername.isBlank()) ? currentUsername : "User";
        } else {
            userId = null;
            if (request.authorName() != null && !request.authorName().isBlank()) {
                String sanitized = request.authorName().trim().replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", "");
                if (sanitized.length() > 50) {
                    sanitized = sanitized.substring(0, 50).trim();
                }
                authorName = sanitized.isEmpty() ? "Anonymous" : sanitized;
            } else {
                authorName = "Anonymous";
            }
            rawDeletionCapability = DeletionCapabilityUtil.generateCapability();
            deletionCapabilityHash = DeletionCapabilityUtil.hashCapability(rawDeletionCapability);
        }

        PasteComment comment = new PasteComment(paste, userId, authorName, trimmedContent, deletionCapabilityHash);
        PasteComment saved = pasteCommentRepository.save(comment);
        activity.recordCommentEvent(saved);

        boolean isPasteAuthor = userId != null && userId.equals(paste.getUserId());
        boolean isAuthenticatedUser = userId != null;

        return new CreateCommentResponse(
                saved.getId(),
                publicId,
                authorName,
                trimmedContent,
                isPasteAuthor,
                isAuthenticatedUser,
                saved.getCreatedAt(),
                rawDeletionCapability
        );
    }

    @Transactional
    public void deleteComment(String publicId,
                              Long commentId,
                              Long currentUserId,
                              String deletionCapability,
                              String userRole,
                              String providedPassword,
                              String clientIp) {
        Paste paste = pasteService.getActivePasteWithAccess(publicId, currentUserId, providedPassword, clientIp);

        PasteComment comment = pasteCommentRepository.findByIdAndPasteId(commentId, paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found on this paste."));

        boolean isAuthorized = false;

        if (currentUserId != null) {
            // Paste owner can moderate/delete any comment on their paste
            if (currentUserId.equals(paste.getUserId())) {
                isAuthorized = true;
            }
            // Comment author can delete their own comment
            else if (currentUserId.equals(comment.getUserId())) {
                isAuthorized = true;
            }
            // Admin role can delete
            else if ("ROLE_ADMIN".equals(userRole)) {
                isAuthorized = true;
            }
        }

        // Anonymous deletion using one-time secret deletionCapability
        if (!isAuthorized && deletionCapability != null && !deletionCapability.isBlank()) {
            if (comment.getDeletionCapabilityHash() != null &&
                    DeletionCapabilityUtil.verifyCapability(deletionCapability.trim(), comment.getDeletionCapabilityHash())) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new ForbiddenException("You do not have permission to delete this comment.");
        }

        pasteCommentRepository.delete(comment);
        events.publishEvent(new PublicListingChangedEvent());
    }
}
