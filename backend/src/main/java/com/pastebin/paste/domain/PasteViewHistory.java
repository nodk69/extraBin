package com.pastebin.paste.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(name = "paste_view_history", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "paste_id"}))
public class PasteViewHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @Column(name = "viewed_at", nullable = false)
    private Instant viewedAt;

    public PasteViewHistory() {
    }

    public PasteViewHistory(Long userId, Paste paste, Instant viewedAt) {
        this.userId = userId;
        this.paste = paste;
        this.viewedAt = viewedAt;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Paste getPaste() {
        return paste;
    }

    public Instant getViewedAt() {
        return viewedAt;
    }

    public void setViewedAt(Instant viewedAt) {
        this.viewedAt = viewedAt;
    }
}
