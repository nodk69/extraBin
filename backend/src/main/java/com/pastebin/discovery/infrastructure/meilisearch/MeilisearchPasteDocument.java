package com.pastebin.discovery.infrastructure.meilisearch;

import java.util.List;

/**
 * Data transfer representation of a document indexed in Meilisearch.
 * Strictly adheres to document size bounds and excludes binary/ciphertext content.
 */
public class MeilisearchPasteDocument {

    private String id; // maps to Paste.publicId
    private String title;
    private String language;
    private List<String> tags;
    private String content; // truncated to 32KB max
    private long createdAt; // epoch second
    private long updatedAt; // epoch second

    public MeilisearchPasteDocument() {
    }

    public MeilisearchPasteDocument(String id, String title, String language, List<String> tags, String content, long createdAt, long updatedAt) {
        this.id = id;
        this.title = title;
        this.language = language;
        this.tags = tags;
        this.content = content;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(long updatedAt) {
        this.updatedAt = updatedAt;
    }
}
