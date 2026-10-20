package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_stars")
public class PasteStar {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public PasteStar() {}

    public PasteStar(Paste paste, Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("Star requires authenticated user_id");
        }
        this.paste = paste;
        this.userId = userId;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Paste getPaste() {
        return paste;
    }

    public Long getUserId() {
        return userId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
