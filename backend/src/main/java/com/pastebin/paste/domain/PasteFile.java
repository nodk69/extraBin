package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "paste_files")
public class PasteFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paste_id", nullable = false)
    private Paste paste;

    @Column(name = "filename", nullable = false, length = 255)
    private String filename;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "ciphertext")
    private byte[] ciphertext;

    @Column(name = "nonce")
    private byte[] nonce;

    @Column(name = "auth_tag")
    private byte[] authTag;

    @Column(name = "ciphertext_sha256")
    private byte[] ciphertextSha256;

    @Column(name = "language", nullable = false, length = 50)
    private String language;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public PasteFile() {
    }

    public PasteFile(Paste paste, String filename, String content, String language, int sortOrder) {
        this.paste = paste;
        this.filename = filename;
        this.content = content;
        this.language = (language == null || language.isBlank()) ? "plaintext" : language.toLowerCase();
        this.sortOrder = Math.max(0, sortOrder);
        this.createdAt = Instant.now();
    }

    public PasteFile(Paste paste, String filename, byte[] ciphertext, byte[] nonce, byte[] authTag,
                     byte[] ciphertextSha256, String language, int sortOrder) {
        this.paste = paste;
        this.filename = filename;
        this.content = null;
        this.ciphertext = ciphertext;
        this.nonce = nonce;
        this.authTag = authTag;
        this.ciphertextSha256 = ciphertextSha256;
        this.language = (language == null || language.isBlank()) ? "plaintext" : language.toLowerCase();
        this.sortOrder = Math.max(0, sortOrder);
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public byte[] getCiphertext() {
        return ciphertext;
    }

    public void setCiphertext(byte[] ciphertext) {
        this.ciphertext = ciphertext;
    }

    public byte[] getNonce() {
        return nonce;
    }

    public void setNonce(byte[] nonce) {
        this.nonce = nonce;
    }

    public byte[] getAuthTag() {
        return authTag;
    }

    public void setAuthTag(byte[] authTag) {
        this.authTag = authTag;
    }

    public byte[] getCiphertextSha256() {
        return ciphertextSha256;
    }

    public void setCiphertextSha256(byte[] ciphertextSha256) {
        this.ciphertextSha256 = ciphertextSha256;
    }
}
