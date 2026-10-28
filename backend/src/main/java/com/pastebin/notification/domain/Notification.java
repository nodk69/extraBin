package com.pastebin.notification.domain;

import com.pastebin.identity.domain.User;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Reply;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(
    name = "notifications",
    indexes = {
        @Index(name = "idx_notifications_recipient_created", columnList = "recipient_id, created_at"),
        @Index(name = "idx_notifications_recipient_unread", columnList = "recipient_id, is_read")
    }
)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private User recipient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paste_id")
    private Paste paste;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_id")
    private Reply reply;

    @Column(name = "type", nullable = false, length = 50)
    private String type;

    @Column(name = "message", nullable = false, length = 255)
    private String message;

    @Column(name = "is_read", nullable = false)
    private boolean isRead = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Notification() {
    }

    public Notification(User recipient, User actor, Paste paste, Reply reply, String type, String message) {
        this.recipient = recipient;
        this.actor = actor;
        this.paste = paste;
        this.reply = reply;
        this.type = type;
        this.message = message;
        this.isRead = false;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public Long getId() {
        return id;
    }

    public User getRecipient() {
        return recipient;
    }

    public void setRecipient(User recipient) {
        this.recipient = recipient;
    }

    public User getActor() {
        return actor;
    }

    public void setActor(User actor) {
        this.actor = actor;
    }

    public Paste getPaste() {
        return paste;
    }

    public void setPaste(Paste paste) {
        this.paste = paste;
    }

    public Reply getReply() {
        return reply;
    }

    public void setReply(Reply reply) {
        this.reply = reply;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public boolean isRead() {
        return isRead;
    }

    public void setRead(boolean read) {
        isRead = read;
        this.updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
