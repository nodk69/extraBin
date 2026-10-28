package com.pastebin.discovery.application;

import com.pastebin.paste.application.PasteReactionService;
import com.pastebin.paste.application.PublicListingChangedEvent;
import com.pastebin.paste.domain.ActivityEventType;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteComment;
import com.pastebin.paste.domain.Reply;
import com.pastebin.paste.infrastructure.PasteActivityEventRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasteActivityIngestionService {
    private static final Duration VIEW_DEDUP_WINDOW = Duration.ofMinutes(10);
    private final PasteActivityEventRepository activityEventRepository;
    private final PasteReactionService pasteReactionService;
    private final ApplicationEventPublisher events;
    private final TrendingPolicy policy;

    public PasteActivityIngestionService(PasteActivityEventRepository activityEventRepository,
                                         PasteReactionService pasteReactionService,
                                         ApplicationEventPublisher events, TrendingPolicy policy) {
        this.activityEventRepository = activityEventRepository;
        this.pasteReactionService = pasteReactionService;
        this.events = events;
        this.policy = policy;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordViewEvent(Paste paste, Long userId, String clientIp) {
        Instant now = policy.now();
        if (!eligibleActor(paste, userId, now)) return;
        Instant cutoff = now.minus(VIEW_DEDUP_WINDOW);
        String ipHash = userId == null ? pasteReactionService.computeIpHash(clientIp) : null;
        boolean recent = userId == null
                ? activityEventRepository.existsRecentByIpHash(paste.getId(), ActivityEventType.VIEW, ipHash, cutoff)
                : activityEventRepository.existsRecentByUserId(paste.getId(), ActivityEventType.VIEW, userId, cutoff);
        if (recent) return;
        activityEventRepository.insertIfAbsent(paste.getId(), "VIEW", userId, ipHash,
                null, null, now, Math.floorDiv(now.getEpochSecond(), VIEW_DEDUP_WINDOW.toSeconds()));
    }

    @Transactional
    public void recordCommentEvent(PasteComment comment) {
        if (comment.getUserId() == null || !eligibleActor(comment.getPaste(), comment.getUserId(), policy.now())) return;
        int inserted = activityEventRepository.insertIfAbsent(comment.getPaste().getId(), "COMMENT", comment.getUserId(),
                null, comment.getId(), null, comment.getCreatedAt(), null);
        if (inserted > 0) events.publishEvent(new PublicListingChangedEvent());
    }

    @Transactional
    public void recordReplyEvent(Reply reply) {
        if (!eligibleActor(reply.getPaste(), reply.getAuthor().getId(), policy.now())) return;
        String type = reply.getParentReply() == null ? "COMMENT" : "REPLY";
        int inserted = activityEventRepository.insertIfAbsent(reply.getPaste().getId(), type, reply.getAuthor().getId(),
                null, null, reply.getId(), reply.getCreatedAt(), null);
        if (inserted > 0) events.publishEvent(new PublicListingChangedEvent());
    }

    private boolean eligibleActor(Paste paste, Long actorId, Instant now) {
        return TrendingPolicy.isEligible(paste, now) && (actorId == null || !actorId.equals(paste.getUserId()));
    }
}
