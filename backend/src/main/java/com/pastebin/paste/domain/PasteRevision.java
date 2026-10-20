package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_revisions")
public class PasteRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paste_id", nullable = false)
    private Long pasteId;

    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "title", length = 100)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "language", nullable = false, length = 50)
    private String language;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public PasteRevision() {
    }

    public PasteRevision(Long pasteId, Long version, String title, String content, String language) {
        this.pasteId = pasteId;
        this.version = version;
        this.title = title;
        this.content = content;
        this.language = language;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getPasteId() {
        return pasteId;
    }

    public Long getVersion() {
        return version;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public String getLanguage() {
        return language;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
