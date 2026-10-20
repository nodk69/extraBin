package com.pastebin.paste.domain;

import com.pastebin.identity.domain.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
    name = "replies",
    indexes = {
        @Index(name = "idx_replies_paste_created", columnList = "paste_id, created_at"),
        @Index(name = "idx_replies_parent", columnList = "parent_reply_id"),
        @Index(name = "idx_replies_author", columnList = "author_id")
    }
)
public class Reply {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_reply_id")
    private Reply parentReply;

    @OneToMany(mappedBy = "parentReply", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<Reply> children = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "is_deleted", nullable = false)
    private boolean isDeleted = false;

    @Column(name = "upvotes", nullable = false)
    private long upvotes = 0;

    @Column(name = "downvotes", nullable = false)
    private long downvotes = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Reply() {
    }

    public Reply(Paste paste, Reply parentReply, User author, String content) {
        this.paste = paste;
        this.parentReply = parentReply;
        this.author = author;
        this.content = content != null ? content.trim() : "";
        this.isDeleted = false;
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

    public Reply getParentReply() {
        return parentReply;
    }

    public void setParentReply(Reply parentReply) {
        this.parentReply = parentReply;
    }

    public List<Reply> getChildren() {
        return children;
    }

    public void setChildren(List<Reply> children) {
        this.children = children;
    }

    public User getAuthor() {
        return author;
    }

    public void setAuthor(User author) {
        this.author = author;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content != null ? content.trim() : "";
        this.updatedAt = Instant.now();
    }

    public boolean isDeleted() {
        return isDeleted;
    }

    public void setDeleted(boolean deleted) {
        isDeleted = deleted;
        this.updatedAt = Instant.now();
    }

    public long getUpvotes() { return upvotes; }
    public void setUpvotes(long upvotes) { this.upvotes = upvotes; }
    public long getDownvotes() { return downvotes; }
    public void setDownvotes(long downvotes) { this.downvotes = downvotes; }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
