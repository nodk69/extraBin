package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_activity_events")
public class PasteActivityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @org.hibernate.annotations.OnDelete(action = org.hibernate.annotations.OnDeleteAction.CASCADE)
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private ActivityEventType eventType;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "client_ip_hash", length = 64)
    private String clientIpHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "source_comment_id")
    private Long sourceCommentId;

    @Column(name = "source_reply_id")
    private Long sourceReplyId;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "view_bucket")
    private Long viewBucket;

    public PasteActivityEvent() {
    }

    public PasteActivityEvent(Paste paste, ActivityEventType eventType, Long userId, String clientIpHash) {
        if ((userId == null && clientIpHash == null) || (userId != null && clientIpHash != null)) {
            throw new IllegalArgumentException("Activity event must have exactly one identity: user_id XOR client_ip_hash");
        }
        this.paste = paste;
        this.eventType = eventType;
        this.userId = userId;
        this.clientIpHash = clientIpHash;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Paste getPaste() {
        return paste;
    }

    public void setPaste(Paste paste) {
        this.paste = paste;
    }

    public ActivityEventType getEventType() {
        return eventType;
    }

    public void setEventType(ActivityEventType eventType) {
        this.eventType = eventType;
    }

    public Long getUserId() {
        return userId;
    }

    public String getClientIpHash() {
        return clientIpHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
