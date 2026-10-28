package com.pastebin.paste.application;

import com.pastebin.paste.api.dto.CommentVoteResponse;
import com.pastebin.paste.api.dto.PasteStarResponse;
import com.pastebin.paste.api.dto.PasteVoteResponse;
import com.pastebin.paste.api.dto.ReplyVoteResponse;
import com.pastebin.paste.api.dto.VoteRequest;
import com.pastebin.paste.domain.*;
import com.pastebin.paste.infrastructure.*;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import com.pastebin.shared.security.RateLimiterService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class PasteReactionService {

    private static final Logger log = LoggerFactory.getLogger(PasteReactionService.class);

    private final PasteRepository pasteRepository;
    private final PasteCommentRepository pasteCommentRepository;
    private final PasteVoteRepository pasteVoteRepository;
    private final PasteStarRepository pasteStarRepository;
    private final PasteCommentVoteRepository pasteCommentVoteRepository;
    private final ReplyRepository replyRepository;
    private final ReplyVoteRepository replyVoteRepository;
    private final com.pastebin.paste.infrastructure.TagRepository tagRepository;
    private final com.pastebin.paste.infrastructure.PasteViewHistoryRepository pasteViewHistoryRepository;
    private final com.pastebin.paste.infrastructure.PasteActivityEventRepository pasteActivityEventRepository;
    private final PasteService pasteService;
    private final RateLimiterService rateLimiterService;
    private final org.springframework.context.ApplicationEventPublisher events;

    @Value("${pastebin.security.vote-pepper:}")
    private String configuredPepper;

    @Value("${spring.profiles.active:dev}")
    private String activeProfile;

    private String effectivePepper;

    public PasteReactionService(
            PasteRepository pasteRepository,
            PasteCommentRepository pasteCommentRepository,
            PasteVoteRepository pasteVoteRepository,
            PasteStarRepository pasteStarRepository,
            PasteCommentVoteRepository pasteCommentVoteRepository,
            ReplyRepository replyRepository,
            ReplyVoteRepository replyVoteRepository,
            PasteService pasteService,
            RateLimiterService rateLimiterService,
            com.pastebin.paste.infrastructure.TagRepository tagRepository,
            com.pastebin.paste.infrastructure.PasteViewHistoryRepository pasteViewHistoryRepository,
            com.pastebin.paste.infrastructure.PasteActivityEventRepository pasteActivityEventRepository,
            org.springframework.context.ApplicationEventPublisher events
    ) {
        this.pasteRepository = pasteRepository;
        this.pasteCommentRepository = pasteCommentRepository;
        this.pasteVoteRepository = pasteVoteRepository;
        this.pasteStarRepository = pasteStarRepository;
        this.pasteCommentVoteRepository = pasteCommentVoteRepository;
        this.replyRepository = replyRepository;
        this.replyVoteRepository = replyVoteRepository;
        this.pasteService = pasteService;
        this.rateLimiterService = rateLimiterService;
        this.tagRepository = tagRepository;
        this.pasteViewHistoryRepository = pasteViewHistoryRepository;
        this.pasteActivityEventRepository = pasteActivityEventRepository;
        this.events = events;
    }

    @PostConstruct
    public void initPepper() {
        if (configuredPepper != null && configuredPepper.trim().length() >= 32) {
            this.effectivePepper = configuredPepper.trim();
        } else {
            if ("prod".equalsIgnoreCase(activeProfile)) {
                throw new IllegalStateException("APP_VOTE_PEPPER must be configured with at least 32 characters in production");
            }
            log.warn("APP_VOTE_PEPPER not configured or too short in non-prod profile; generating ephemeral random pepper.");
            byte[] rand = new byte[32];
            new SecureRandom().nextBytes(rand);
            this.effectivePepper = HexFormat.of().formatHex(rand);
        }
    }

    public String computeIpHash(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            clientIp = "127.0.0.1";
        }
        try {
            Mac hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(effectivePepper.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmac.init(secretKey);
            byte[] hash = hmac.doFinal(clientIp.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to calculate HMAC-SHA256 IP hash", e);
        }
    }

    private void checkRateLimit(Long userId, String clientIp, String action) {
        if (userId != null) {
            rateLimiterService.checkRateLimit(action + ":user:" + userId, 60, 60);
        } else {
            String ip = (clientIp != null && !clientIp.isBlank()) ? clientIp.trim() : "127.0.0.1";
            rateLimiterService.checkRateLimit(action + ":ip:" + ip, 30, 60);
        }
    }

    private Paste verifyPasteAccessForReaction(String publicId, Long userId, String password, String clientIp, String shareToken) {
        Paste paste = pasteService.getActivePasteWithAccess(publicId, userId, password, clientIp, shareToken);
        if (paste.isBurnAfterReading()) {
            throw new BadRequestException("Reactions and stars are disabled on one-time pastes.");
        }
        return paste;
    }

    // =========================================================================
    // 1. Paste Votes
    // =========================================================================

    @Transactional
    public PasteVoteResponse votePaste(String publicId, VoteRequest request, Long userId, String password, String clientIp, String shareToken) {
        checkRateLimit(userId, clientIp, "vote");
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);

        // Pessimistic write lock on paste row to serialize counter mutations
        Paste lockedPaste = pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        String ipHash = (userId == null) ? computeIpHash(clientIp) : null;
        Optional<PasteVote> existingVoteOpt = (userId != null)
                ? pasteVoteRepository.findByPasteIdAndUserId(lockedPaste.getId(), userId)
                : pasteVoteRepository.findByPasteIdAndClientIpHash(lockedPaste.getId(), ipHash);

        VoteType targetType = request.voteType();

        if (existingVoteOpt.isPresent()) {
            PasteVote existing = existingVoteOpt.get();
            if (existing.getVoteType() == targetType) {
                // Idempotent duplicate
                return new PasteVoteResponse(publicId, lockedPaste.getUpvotes(), lockedPaste.getDownvotes(), targetType);
            }
            // Toggle
            if (targetType == VoteType.DOWN) {
                pasteRepository.toggleUpToDown(lockedPaste.getId());
                // Remove UPVOTE event from trending activity ledger
                if (userId != null) {
                    pasteActivityEventRepository.revokeUserEvents(lockedPaste.getId(), userId, com.pastebin.paste.domain.ActivityEventType.UPVOTE);
                } else {
                    pasteActivityEventRepository.revokeIpEvents(lockedPaste.getId(), ipHash, com.pastebin.paste.domain.ActivityEventType.UPVOTE);
                }
            } else {
                pasteRepository.toggleDownToUp(lockedPaste.getId());
                // Record UPVOTE event in trending activity ledger if eligible
                if (lockedPaste.getVisibility() == com.pastebin.paste.domain.Visibility.PUBLIC
                        && !lockedPaste.isBurnAfterReading() && lockedPaste.getPasswordHash() == null && lockedPaste.getEncryptionMode() == null
                        && (userId == null || !userId.equals(lockedPaste.getUserId()))) {
                    pasteActivityEventRepository.save(new com.pastebin.paste.domain.PasteActivityEvent(
                            lockedPaste, com.pastebin.paste.domain.ActivityEventType.UPVOTE, userId, ipHash));
                }
            }
            existing.setVoteType(targetType);
            pasteVoteRepository.save(existing);
        } else {
            // New vote
            PasteVote newVote = new PasteVote(lockedPaste, userId, ipHash, targetType);
            pasteVoteRepository.save(newVote);
            if (targetType == VoteType.UP) {
                pasteRepository.incrementUpvotes(lockedPaste.getId());
                if (lockedPaste.getVisibility() == com.pastebin.paste.domain.Visibility.PUBLIC
                        && !lockedPaste.isBurnAfterReading() && lockedPaste.getPasswordHash() == null && lockedPaste.getEncryptionMode() == null
                        && (userId == null || !userId.equals(lockedPaste.getUserId()))) {
                    pasteActivityEventRepository.save(new com.pastebin.paste.domain.PasteActivityEvent(
                            lockedPaste, com.pastebin.paste.domain.ActivityEventType.UPVOTE, userId, ipHash));
                }
            } else {
                pasteRepository.incrementDownvotes(lockedPaste.getId());
            }
        }

        events.publishEvent(new PublicListingChangedEvent());
        Paste fresh = pasteRepository.findById(lockedPaste.getId()).orElse(lockedPaste);
        return new PasteVoteResponse(publicId, fresh.getUpvotes(), fresh.getDownvotes(), targetType);
    }

    @Transactional
    public PasteVoteResponse retractPasteVote(String publicId, Long userId, String password, String clientIp, String shareToken) {
        checkRateLimit(userId, clientIp, "vote");
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);

        Paste lockedPaste = pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        String ipHash = (userId == null) ? computeIpHash(clientIp) : null;
        Optional<PasteVote> existingVoteOpt = (userId != null)
                ? pasteVoteRepository.findByPasteIdAndUserId(lockedPaste.getId(), userId)
                : pasteVoteRepository.findByPasteIdAndClientIpHash(lockedPaste.getId(), ipHash);

        if (existingVoteOpt.isPresent()) {
            PasteVote existing = existingVoteOpt.get();
            if (existing.getVoteType() == VoteType.UP) {
                pasteRepository.decrementUpvotes(lockedPaste.getId());
                if (userId != null) {
                    pasteActivityEventRepository.revokeUserEvents(lockedPaste.getId(), userId, com.pastebin.paste.domain.ActivityEventType.UPVOTE);
                } else {
                    pasteActivityEventRepository.revokeIpEvents(lockedPaste.getId(), ipHash, com.pastebin.paste.domain.ActivityEventType.UPVOTE);
                }
            } else {
                pasteRepository.decrementDownvotes(lockedPaste.getId());
            }
            pasteVoteRepository.delete(existing);
            events.publishEvent(new PublicListingChangedEvent());
        }

        Paste fresh = pasteRepository.findById(lockedPaste.getId()).orElse(lockedPaste);
        return new PasteVoteResponse(publicId, fresh.getUpvotes(), fresh.getDownvotes(), null);
    }

    // =========================================================================
    // 2. Paste Starring
    // =========================================================================

    @Transactional
    public PasteStarResponse starPaste(String publicId, Long userId, String password, String clientIp, String shareToken) {
        if (userId == null) {
            throw new org.springframework.security.authentication.InsufficientAuthenticationException("Sign in to star pastes");
        }
        rateLimiterService.checkRateLimit("star:user:" + userId, 30, 60);

        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);
        Paste lockedPaste = pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!pasteStarRepository.existsByPasteIdAndUserId(lockedPaste.getId(), userId)) {
            pasteStarRepository.save(new PasteStar(lockedPaste, userId));
            pasteRepository.incrementStars(lockedPaste.getId());
            if (lockedPaste.getVisibility() == com.pastebin.paste.domain.Visibility.PUBLIC
                    && !lockedPaste.isBurnAfterReading() && lockedPaste.getPasswordHash() == null && lockedPaste.getEncryptionMode() == null
                        && (userId == null || !userId.equals(lockedPaste.getUserId()))) {
                pasteActivityEventRepository.save(new com.pastebin.paste.domain.PasteActivityEvent(
                        lockedPaste, com.pastebin.paste.domain.ActivityEventType.STAR, userId, null));
            }
            events.publishEvent(new PublicListingChangedEvent());
        }

        Paste fresh = pasteRepository.findById(lockedPaste.getId()).orElse(lockedPaste);
        return new PasteStarResponse(publicId, fresh.getStarsCount(), true);
    }

    @Transactional
    public PasteStarResponse unstarPaste(String publicId, Long userId, String password, String clientIp, String shareToken) {
        if (userId == null) {
            throw new org.springframework.security.authentication.InsufficientAuthenticationException("Sign in required");
        }
        rateLimiterService.checkRateLimit("star:user:" + userId, 30, 60);
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);
        Paste lockedPaste = pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        Optional<PasteStar> starOpt = pasteStarRepository.findByPasteIdAndUserId(lockedPaste.getId(), userId);
        if (starOpt.isPresent()) {
            pasteStarRepository.delete(starOpt.get());
            pasteRepository.decrementStars(lockedPaste.getId());
            pasteActivityEventRepository.revokeUserEvents(lockedPaste.getId(), userId, com.pastebin.paste.domain.ActivityEventType.STAR);
            events.publishEvent(new PublicListingChangedEvent());
        }

        Paste fresh = pasteRepository.findById(lockedPaste.getId()).orElse(lockedPaste);
        return new PasteStarResponse(publicId, fresh.getStarsCount(), false);
    }

    // =========================================================================
    // 3. Comment Votes
    // =========================================================================

    @Transactional
    public CommentVoteResponse voteComment(String publicId, Long commentId, VoteRequest request, Long userId, String password, String clientIp, String shareToken) {
        checkRateLimit(userId, clientIp, "vote");
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);

        // Lock hierarchy: Parent Paste lock first, then Child Comment lock
        pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        PasteComment lockedComment = pasteCommentRepository.findByIdAndPasteIdForUpdate(commentId, paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found on this paste."));

        String ipHash = (userId == null) ? computeIpHash(clientIp) : null;
        Optional<PasteCommentVote> existingVoteOpt = (userId != null)
                ? pasteCommentVoteRepository.findByCommentIdAndUserId(lockedComment.getId(), userId)
                : pasteCommentVoteRepository.findByCommentIdAndClientIpHash(lockedComment.getId(), ipHash);

        VoteType targetType = request.voteType();

        if (existingVoteOpt.isPresent()) {
            PasteCommentVote existing = existingVoteOpt.get();
            if (existing.getVoteType() == targetType) {
                return new CommentVoteResponse(commentId, lockedComment.getUpvotes(), lockedComment.getDownvotes(), targetType);
            }
            if (targetType == VoteType.DOWN) {
                pasteCommentRepository.toggleUpToDown(lockedComment.getId());
            } else {
                pasteCommentRepository.toggleDownToUp(lockedComment.getId());
            }
            existing.setVoteType(targetType);
            pasteCommentVoteRepository.save(existing);
        } else {
            PasteCommentVote newVote = new PasteCommentVote(lockedComment, userId, ipHash, targetType);
            pasteCommentVoteRepository.save(newVote);
            if (targetType == VoteType.UP) {
                pasteCommentRepository.incrementUpvotes(lockedComment.getId());
            } else {
                pasteCommentRepository.incrementDownvotes(lockedComment.getId());
            }
        }

        PasteComment fresh = pasteCommentRepository.findById(lockedComment.getId()).orElse(lockedComment);
        return new CommentVoteResponse(commentId, fresh.getUpvotes(), fresh.getDownvotes(), targetType);
    }

    @Transactional
    public CommentVoteResponse retractCommentVote(String publicId, Long commentId, Long userId, String password, String clientIp, String shareToken) {
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);

        pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        PasteComment lockedComment = pasteCommentRepository.findByIdAndPasteIdForUpdate(commentId, paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found on this paste."));

        String ipHash = (userId == null) ? computeIpHash(clientIp) : null;
        Optional<PasteCommentVote> existingVoteOpt = (userId != null)
                ? pasteCommentVoteRepository.findByCommentIdAndUserId(lockedComment.getId(), userId)
                : pasteCommentVoteRepository.findByCommentIdAndClientIpHash(lockedComment.getId(), ipHash);

        if (existingVoteOpt.isPresent()) {
            PasteCommentVote existing = existingVoteOpt.get();
            if (existing.getVoteType() == VoteType.UP) {
                pasteCommentRepository.decrementUpvotes(lockedComment.getId());
            } else {
                pasteCommentRepository.decrementDownvotes(lockedComment.getId());
            }
            pasteCommentVoteRepository.delete(existing);
        }

        PasteComment fresh = pasteCommentRepository.findById(lockedComment.getId()).orElse(lockedComment);
        return new CommentVoteResponse(commentId, fresh.getUpvotes(), fresh.getDownvotes(), null);
    }

    // =========================================================================
    // 3b. Reply Voting
    // =========================================================================

    @Transactional
    public ReplyVoteResponse voteReply(String publicId, Long replyId, VoteRequest request, Long userId, String password, String clientIp, String shareToken) {
        checkRateLimit(userId, clientIp, "vote");
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);

        pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        Reply lockedReply = replyRepository.findByIdAndPasteIdForUpdate(replyId, paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Reply not found on this paste."));

        String ipHash = (userId == null) ? computeIpHash(clientIp) : null;
        Optional<ReplyVote> existingVoteOpt = (userId != null)
                ? replyVoteRepository.findByReplyIdAndUserId(lockedReply.getId(), userId)
                : replyVoteRepository.findByReplyIdAndClientIpHash(lockedReply.getId(), ipHash);

        VoteType targetType = request.voteType();

        if (existingVoteOpt.isPresent()) {
            ReplyVote existing = existingVoteOpt.get();
            if (existing.getVoteType() == targetType) {
                return new ReplyVoteResponse(replyId, lockedReply.getUpvotes(), lockedReply.getDownvotes(), targetType);
            }
            if (targetType == VoteType.DOWN) {
                replyRepository.toggleUpToDown(lockedReply.getId());
            } else {
                replyRepository.toggleDownToUp(lockedReply.getId());
            }
            existing.setVoteType(targetType);
            replyVoteRepository.save(existing);
        } else {
            ReplyVote newVote = new ReplyVote(lockedReply, userId, ipHash, targetType);
            replyVoteRepository.save(newVote);
            if (targetType == VoteType.UP) {
                replyRepository.incrementUpvotes(lockedReply.getId());
            } else {
                replyRepository.incrementDownvotes(lockedReply.getId());
            }
        }

        Reply fresh = replyRepository.findById(lockedReply.getId()).orElse(lockedReply);
        VoteType userVote = existingVoteOpt.map(v -> targetType).orElse(targetType);
        return new ReplyVoteResponse(replyId, fresh.getUpvotes(), fresh.getDownvotes(), userVote);
    }

    @Transactional
    public ReplyVoteResponse retractReplyVote(String publicId, Long replyId, Long userId, String password, String clientIp, String shareToken) {
        Paste paste = verifyPasteAccessForReaction(publicId, userId, password, clientIp, shareToken);

        pasteRepository.findByIdForUpdate(paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        Reply lockedReply = replyRepository.findByIdAndPasteIdForUpdate(replyId, paste.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Reply not found on this paste."));

        String ipHash = (userId == null) ? computeIpHash(clientIp) : null;
        Optional<ReplyVote> existingVoteOpt = (userId != null)
                ? replyVoteRepository.findByReplyIdAndUserId(lockedReply.getId(), userId)
                : replyVoteRepository.findByReplyIdAndClientIpHash(lockedReply.getId(), ipHash);

        if (existingVoteOpt.isPresent()) {
            ReplyVote existing = existingVoteOpt.get();
            if (existing.getVoteType() == VoteType.UP) {
                replyRepository.decrementUpvotes(lockedReply.getId());
            } else {
                replyRepository.decrementDownvotes(lockedReply.getId());
            }
            replyVoteRepository.delete(existing);
        }

        Reply fresh = replyRepository.findById(lockedReply.getId()).orElse(lockedReply);
        return new ReplyVoteResponse(replyId, fresh.getUpvotes(), fresh.getDownvotes(), null);
    }

    // =========================================================================
    // 4. Maintenance & Deletion Routines
    // =========================================================================

    @Transactional
    public void deleteUserMaintenance(Long userId) {
        if (userId == null) return;

        // 1. Decrement paste votes
        for (PasteVote pv : pasteVoteRepository.findByUserId(userId)) {
            if (pv.getVoteType() == VoteType.UP) {
                pasteRepository.decrementUpvotes(pv.getPaste().getId());
            } else {
                pasteRepository.decrementDownvotes(pv.getPaste().getId());
            }
        }

        // 2. Decrement paste stars
        for (PasteStar ps : pasteStarRepository.findByUserId(userId)) {
            pasteRepository.decrementStars(ps.getPaste().getId());
        }

        // 3. Decrement comment votes
        for (PasteCommentVote cv : pasteCommentVoteRepository.findByUserId(userId)) {
            if (cv.getVoteType() == VoteType.UP) {
                pasteCommentRepository.decrementUpvotes(cv.getComment().getId());
            } else {
                pasteCommentRepository.decrementDownvotes(cv.getComment().getId());
            }
        }

        // 4. Decrement reply votes
        for (ReplyVote rv : replyVoteRepository.findByUserId(userId)) {
            if (rv.getVoteType() == VoteType.UP) {
                replyRepository.decrementUpvotes(rv.getReply().getId());
            } else {
                replyRepository.decrementDownvotes(rv.getReply().getId());
            }
        }

        // 5. Delete owned tags (join rows cleaned by DB cascade on paste_tags.tag_id)
        tagRepository.deleteAll(tagRepository.findAllByUserIdOrderByName(userId));

        // 6. Delete view history
        pasteViewHistoryRepository.deleteAll(pasteViewHistoryRepository.findByUserId(userId));
    }

    @Transactional
    public void reconcileAllCounters() {
        pasteRepository.reconcileAllPasteCounters();
        pasteCommentRepository.reconcileAllCommentCounters();
    }

    @Transactional
    public void purgeAnonymousVotesAndReconcile() {
        pasteVoteRepository.deleteAllAnonymous();
        pasteCommentVoteRepository.deleteAllAnonymous();
        replyVoteRepository.deleteAllAnonymous();
        reconcileAllCounters();
    }
}
