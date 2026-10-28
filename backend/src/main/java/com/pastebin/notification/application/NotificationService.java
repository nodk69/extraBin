package com.pastebin.notification.application;

import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.notification.api.dto.NotificationResponse;
import com.pastebin.notification.domain.Notification;
import com.pastebin.notification.infrastructure.NotificationRepository;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Reply;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

@Service
public class NotificationService {

    private static final Duration BATCH_WINDOW = Duration.ofMinutes(5);

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    public NotificationService(NotificationRepository notificationRepository, UserRepository userRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public void notifyReplyCreated(Paste paste, Reply parentReply, Reply createdReply, User actor) {
        if (paste == null || createdReply == null || actor == null) {
            return;
        }

        Instant windowStart = Instant.now().minus(BATCH_WINDOW);
        String pasteTitle = (paste.getTitle() != null && !paste.getTitle().isBlank())
                ? paste.getTitle().trim()
                : "Untitled (" + paste.getPublicId() + ")";

        Long actorId = actor.getId();

        // 1. Notify Paste Author
        if (paste.getUserId() != null && !paste.getUserId().equals(actorId)) {
            userRepository.findById(paste.getUserId()).ifPresent(pasteAuthor -> {
                if (pasteAuthor.isNotifyOnReplies()) {
                    List<Notification> recent = notificationRepository.findRecentForRecipientAndPaste(
                            pasteAuthor.getId(), paste.getId(), windowStart
                    );
                    if (recent.isEmpty()) {
                        String msg = actor.getUsername() + " replied to your paste: " + pasteTitle;
                        Notification notification = new Notification(
                                pasteAuthor, actor, paste, createdReply, "PASTE_REPLY", msg
                        );
                        notificationRepository.save(notification);
                    }
                }
            });
        }

        // 2. Notify Parent Reply Author (if different from paste author and different from actor)
        if (parentReply != null && parentReply.getAuthor() != null) {
            User parentAuthor = parentReply.getAuthor();
            Long parentAuthorId = parentAuthor.getId();

            boolean isSameAsActor = parentAuthorId.equals(actorId);
            boolean isSameAsPasteAuthor = paste.getUserId() != null && paste.getUserId().equals(parentAuthorId);

            if (!isSameAsActor && !isSameAsPasteAuthor) {
                if (parentAuthor.isNotifyOnReplies()) {
                    List<Notification> recent = notificationRepository.findRecentForRecipientAndPaste(
                            parentAuthorId, paste.getId(), windowStart
                    );
                    if (recent.isEmpty()) {
                        String msg = actor.getUsername() + " replied to your thread in: " + pasteTitle;
                        Notification notification = new Notification(
                                parentAuthor, actor, paste, createdReply, "THREAD_REPLY", msg
                        );
                        notificationRepository.save(notification);
                    }
                }
            }
        }
    }

    @Transactional
    public void notifyNewFollower(User recipient, Long actorId) {
        if (recipient == null || actorId == null || recipient.getId().equals(actorId) || !recipient.isNotifyOnFollows()) return;
        userRepository.findById(actorId).ifPresent(actor -> notificationRepository.save(
                new Notification(recipient, actor, null, null, "NEW_FOLLOWER", actor.getUsername() + " started following you.")));
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(Long userId, int limit) {
        if (userId == null) {
            return Collections.emptyList();
        }
        int effectiveLimit = Math.max(1, Math.min(limit, 50));
        return notificationRepository.findByRecipientIdOrderByCreatedAtDesc(userId, PageRequest.of(0, effectiveLimit))
                .stream()
                .map(n -> new NotificationResponse(
                        n.getId(),
                        n.getType(),
                        n.getMessage(),
                        n.getPaste() != null ? n.getPaste().getPublicId() : null,
                        n.getReply() != null ? n.getReply().getId() : null,
                        n.getActor() != null ? n.getActor().getUsername() : "Anonymous",
                        n.isRead(),
                        n.getCreatedAt()
                ))
                .toList();
    }

    @Transactional
    public boolean markAsRead(Long userId, Long notificationId) {
        return notificationRepository.markAsRead(notificationId, userId, Instant.now()) > 0;
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(Long userId) {
        if (userId == null) {
            return 0;
        }
        return notificationRepository.countUnreadByRecipientId(userId);
    }

    @Transactional
    public void markAllAsRead(Long userId) {
        if (userId != null) {
            notificationRepository.markAllAsRead(userId, Instant.now());
        }
    }
}
