package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_comments")
public class PasteComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "author_name", nullable = false, length = 50)
    private String authorName;

    @Column(name = "content", nullable = false, length = 2000)
    private String content;

    @Column(name = "deletion_capability_hash", length = 128)
    private String deletionCapabilityHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "upvotes", nullable = false)
    private long upvotes = 0;

    @Column(name = "downvotes", nullable = false)
    private long downvotes = 0;

    public PasteComment() {
    }

    public PasteComment(Paste paste, Long userId, String authorName, String content, String deletionCapabilityHash) {
        this.paste = paste;
        this.userId = userId;
        this.authorName = (authorName != null && !authorName.isBlank()) ? authorName.trim() : "Anonymous";
        this.content = (content != null) ? content.trim() : "";
        this.deletionCapabilityHash = deletionCapabilityHash;
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

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getAuthorName() {
        return authorName;
    }

    public void setAuthorName(String authorName) {
        this.authorName = authorName;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getDeletionCapabilityHash() {
        return deletionCapabilityHash;
    }

    public void setDeletionCapabilityHash(String deletionCapabilityHash) {
        this.deletionCapabilityHash = deletionCapabilityHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public boolean isAnonymous() {
        return userId == null;
    }

    public long getUpvotes() {
        return upvotes;
    }

    public void setUpvotes(long upvotes) {
        this.upvotes = upvotes;
    }

    public long getDownvotes() {
        return downvotes;
    }

    public void setDownvotes(long downvotes) {
        this.downvotes = downvotes;
    }
}
