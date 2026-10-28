package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_revision_files")
public class PasteRevisionFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "revision_id", nullable = false)
    private PasteRevision revision;

    @Column(name = "filename", nullable = false, length = 255)
    private String filename;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "language", nullable = false, length = 50)
    private String language;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "is_primary", nullable = false)
    private boolean isPrimary = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public PasteRevisionFile() {
    }

    public PasteRevisionFile(PasteRevision revision, String filename, String content, String language, int sortOrder, boolean isPrimary) {
        this.revision = revision;
        this.filename = filename;
        this.content = content;
        this.language = (language == null || language.isBlank()) ? "plaintext" : language.toLowerCase();
        this.sortOrder = Math.max(0, sortOrder);
        this.isPrimary = isPrimary;
        this.createdAt = Instant.now();
    }

    public PasteRevisionFile(PasteRevision revision, String filename, String content, String language, int sortOrder) {
        this(revision, filename, content, language, sortOrder, sortOrder == 0);
    }

    public Long getId() {
        return id;
    }

    public PasteRevision getRevision() {
        return revision;
    }

    public void setRevision(PasteRevision revision) {
        this.revision = revision;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = (language == null || language.isBlank()) ? "plaintext" : language.toLowerCase();
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = Math.max(0, sortOrder);
    }

    public boolean isPrimary() {
        return isPrimary;
    }

    public void setPrimary(boolean primary) {
        isPrimary = primary;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
