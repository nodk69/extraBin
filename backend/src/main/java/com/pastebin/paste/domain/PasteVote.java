package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_votes")
public class PasteVote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "client_ip_hash", length = 64)
    private String clientIpHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "vote_type", nullable = false, length = 10)
    private VoteType voteType;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PasteVote() {}

    public PasteVote(Paste paste, Long userId, String clientIpHash, VoteType voteType) {
        if ((userId == null && clientIpHash == null) || (userId != null && clientIpHash != null)) {
            throw new IllegalArgumentException("Vote must have exactly one identity: user_id XOR client_ip_hash");
        }
        this.paste = paste;
        this.userId = userId;
        this.clientIpHash = clientIpHash;
        this.voteType = voteType;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
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

    public Long getUserId() {
        return userId;
    }

    public String getClientIpHash() {
        return clientIpHash;
    }

    public VoteType getVoteType() {
        return voteType;
    }

    public void setVoteType(VoteType voteType) {
        this.voteType = voteType;
        this.updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
