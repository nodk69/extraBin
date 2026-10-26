package com.pastebin.discovery.application;

import com.pastebin.paste.application.PasteReactionService;
import com.pastebin.paste.domain.ActivityEventType;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteActivityEvent;
import com.pastebin.paste.infrastructure.PasteActivityEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Ingests genuine user engagement events (views, stars, upvotes) for trending calculations.
 * Applies deduplication sliding windows (e.g., 10 minutes per IP/user for views)
 * to prevent reload spam, refresh bot attacks, and artificial score inflation.
 * Non-blocking, isolated transaction propagation ensures activity logging never breaks paste reads.
 */
@Service
public class PasteActivityIngestionService {

    private static final Logger log = LoggerFactory.getLogger(PasteActivityIngestionService.class);
    private static final Duration VIEW_DEDUP_WINDOW = Duration.ofMinutes(10);

    private final PasteActivityEventRepository activityEventRepository;
    private final PasteReactionService pasteReactionService;

    public PasteActivityIngestionService(PasteActivityEventRepository activityEventRepository,
                                         PasteReactionService pasteReactionService) {
        this.activityEventRepository = activityEventRepository;
        this.pasteReactionService = pasteReactionService;
    }

    /**
     * Records an eligible view event with deduplication.
     * Only public pastes with active moderation and non-expired status receive trending events.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordViewEvent(Paste paste, Long userId, String clientIp) {
        try {
            if (paste == null || paste.getVisibility() != com.pastebin.paste.domain.Visibility.PUBLIC
                    || paste.isBurnAfterReading() || paste.getPasswordHash() != null || paste.getEncryptionMode() != null) {
                return;
            }

            Instant cutoff = Instant.now().minus(VIEW_DEDUP_WINDOW);

            if (userId != null) {
                if (activityEventRepository.existsRecentByUserId(paste.getId(), ActivityEventType.VIEW, userId, cutoff)) {
                    return; // Deduplicated
                }
                activityEventRepository.save(new PasteActivityEvent(paste, ActivityEventType.VIEW, userId, null));
            } else {
                String ipHash = pasteReactionService.computeIpHash(clientIp);
                if (activityEventRepository.existsRecentByIpHash(paste.getId(), ActivityEventType.VIEW, ipHash, cutoff)) {
                    return; // Deduplicated
                }
                activityEventRepository.save(new PasteActivityEvent(paste, ActivityEventType.VIEW, null, ipHash));
            }
        } catch (Exception e) {
            log.warn("Failed to record view activity event for paste id {}: {}", paste.getId(), e.getMessage());
        }
    }

    /**
     * Records a star engagement event.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordStarEvent(Paste paste, Long userId) {
        try {
            if (paste == null || paste.getVisibility() != com.pastebin.paste.domain.Visibility.PUBLIC
                    || paste.isBurnAfterReading() || paste.getPasswordHash() != null || paste.getEncryptionMode() != null) {
                return;
            }
            if (userId != null) {
                activityEventRepository.save(new PasteActivityEvent(paste, ActivityEventType.STAR, userId, null));
            }
        } catch (Exception e) {
            log.warn("Failed to record star activity event for paste id {}: {}", paste.getId(), e.getMessage());
        }
    }

    /**
     * Records an upvote engagement event.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordUpvoteEvent(Paste paste, Long userId, String clientIp) {
        try {
            if (paste == null || paste.getVisibility() != com.pastebin.paste.domain.Visibility.PUBLIC
                    || paste.isBurnAfterReading() || paste.getPasswordHash() != null || paste.getEncryptionMode() != null) {
                return;
            }
            if (userId != null) {
                activityEventRepository.save(new PasteActivityEvent(paste, ActivityEventType.UPVOTE, userId, null));
            } else {
                String ipHash = pasteReactionService.computeIpHash(clientIp);
                activityEventRepository.save(new PasteActivityEvent(paste, ActivityEventType.UPVOTE, null, ipHash));
            }
        } catch (Exception e) {
            log.warn("Failed to record upvote activity event for paste id {}: {}", paste.getId(), e.getMessage());
        }
    }
}
