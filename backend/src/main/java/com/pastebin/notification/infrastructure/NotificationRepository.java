package com.pastebin.notification.infrastructure;

import com.pastebin.notification.domain.Notification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    @Query("SELECT n FROM Notification n LEFT JOIN FETCH n.actor LEFT JOIN FETCH n.paste WHERE n.recipient.id = :recipientId ORDER BY n.createdAt DESC, n.id DESC")
    List<Notification> findByRecipientIdOrderByCreatedAtDesc(@Param("recipientId") Long recipientId, Pageable pageable);

    @Query("SELECT COUNT(n) FROM Notification n WHERE n.recipient.id = :recipientId AND n.isRead = false")
    long countUnreadByRecipientId(@Param("recipientId") Long recipientId);

    @Query("SELECT n FROM Notification n LEFT JOIN FETCH n.actor LEFT JOIN FETCH n.paste WHERE n.recipient.id = :recipientId AND n.paste.id = :pasteId AND n.createdAt >= :since ORDER BY n.createdAt DESC")
    List<Notification> findRecentForRecipientAndPaste(@Param("recipientId") Long recipientId, @Param("pasteId") Long pasteId, @Param("since") Instant since);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true, n.updatedAt = :now WHERE n.id = :notificationId AND n.recipient.id = :recipientId AND n.isRead = false")
    int markAsRead(@Param("notificationId") Long notificationId, @Param("recipientId") Long recipientId, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true, n.updatedAt = :now WHERE n.recipient.id = :recipientId AND n.isRead = false")
    int markAllAsRead(@Param("recipientId") Long recipientId, @Param("now") Instant now);
}
