package com.pastebin.paste.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "pastes")
public class Paste {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, length = 64)
    private String publicId;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "title", length = 100)
    private String title;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "language", nullable = false, length = 50)
    private String language;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private Visibility visibility;

    @Column(name = "content_size_bytes", nullable = false)
    private int contentSizeBytes;

    @Column(name = "line_count", nullable = false)
    private int lineCount;

    @Column(name = "deletion_capability_hash", length = 128)
    private String deletionCapabilityHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "last_edited_at")
    private Instant lastEditedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "burn_after_reading", nullable = false)
    private boolean burnAfterReading = false;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "encryption_mode", length = 16)
    private EncryptionMode encryptionMode;

    @Column(name = "kdf_salt")
    private byte[] kdfSalt;

    @Column(name = "kdf_iterations")
    private Integer kdfIterations;

    @Column(name = "wrapped_key")
    private byte[] wrappedKey;

    @Column(name = "views", nullable = false)
    private long views = 0;

    @Column(name = "upvotes", nullable = false)
    private long upvotes = 0;

    @Column(name = "downvotes", nullable = false)
    private long downvotes = 0;

    @Column(name = "stars_count", nullable = false)
    private long starsCount = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "share_access_state", nullable = false, length = 20)
    private ShareAccessState shareAccessState = ShareAccessState.NOT_APPLICABLE;

    @Enumerated(EnumType.STRING)
    @Column(name = "moderation_state", nullable = false, length = 20)
    private ModerationState moderationState = ModerationState.ACTIVE;

    @Column(name = "share_token_hash", length = 64)
    private String shareTokenHash;

    @Column(name = "link_revoked_at")
    private Instant linkRevokedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "paste", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC, id ASC")
    private List<PasteFile> files = new ArrayList<>();

    @OneToMany(mappedBy = "paste", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC")
    private List<PasteComment> comments = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private Folder folder;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "paste_tags",
            joinColumns = @JoinColumn(name = "paste_id"),
            inverseJoinColumns = @JoinColumn(name = "tag_id"))
    private Set<Tag> tags = new HashSet<>();

    public Set<Tag> getTags() {
        return tags;
    }

    public void setTags(Set<Tag> tags) {
        this.tags = tags;
    }

    public Paste() {
    }

    public Paste(String publicId, Long userId, String title, String content, String language,
                 Visibility visibility, int contentSizeBytes, int lineCount,
                 String deletionCapabilityHash, Instant expiresAt) {
        this(publicId, userId, title, content, language, visibility, contentSizeBytes, lineCount,
             deletionCapabilityHash, expiresAt, false, null);
    }

    public Paste(String publicId, Long userId, String title, String content, String language,
                 Visibility visibility, int contentSizeBytes, int lineCount,
                 String deletionCapabilityHash, Instant expiresAt, boolean burnAfterReading) {
        this(publicId, userId, title, content, language, visibility, contentSizeBytes, lineCount,
             deletionCapabilityHash, expiresAt, burnAfterReading, null);
    }

    public Paste(String publicId, Long userId, String title, String content, String language,
                 Visibility visibility, int contentSizeBytes, int lineCount,
                 String deletionCapabilityHash, Instant expiresAt, boolean burnAfterReading,
                 String passwordHash) {
        this.publicId = publicId;
        this.userId = userId;
        this.title = title;
        this.content = content;
        this.language = (language == null || language.isBlank()) ? "plaintext" : language.toLowerCase();
        this.visibility = visibility != null ? visibility : Visibility.PUBLIC;
        this.contentSizeBytes = contentSizeBytes;
        this.lineCount = lineCount;
        this.deletionCapabilityHash = deletionCapabilityHash;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
        this.expiresAt = expiresAt;
        this.burnAfterReading = burnAfterReading;
        this.passwordHash = passwordHash;
        if (this.visibility == Visibility.UNLISTED && this.shareAccessState == ShareAccessState.NOT_APPLICABLE) {
            this.shareAccessState = ShareAccessState.LEGACY_OPEN;
        }
    }

    public Paste(String publicId, Long userId, String title, String language,
                 Visibility visibility, int contentSizeBytes, int lineCount,
                 String deletionCapabilityHash, Instant expiresAt, boolean burnAfterReading,
                 EncryptionMode encryptionMode, byte[] kdfSalt, Integer kdfIterations, byte[] wrappedKey) {
        this.publicId = publicId;
        this.userId = userId;
        this.title = title;
        this.content = null;
        this.language = (language == null || language.isBlank()) ? "plaintext" : language.toLowerCase();
        this.visibility = visibility != null ? visibility : Visibility.UNLISTED;
        this.contentSizeBytes = contentSizeBytes;
        this.lineCount = lineCount;
        this.deletionCapabilityHash = deletionCapabilityHash;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
        this.expiresAt = expiresAt;
        this.burnAfterReading = burnAfterReading;
        this.passwordHash = null;
        this.encryptionMode = encryptionMode;
        this.kdfSalt = kdfSalt;
        this.kdfIterations = kdfIterations;
        this.wrappedKey = wrappedKey;
        if (this.visibility == Visibility.UNLISTED && this.shareAccessState == ShareAccessState.NOT_APPLICABLE) {
            this.shareAccessState = ShareAccessState.LEGACY_OPEN;
        }
    }

    public boolean isEncrypted() {
        return encryptionMode != null;
    }

    public boolean isExpired(Instant currentInstant) {
        return expiresAt != null && !currentInstant.isBefore(expiresAt);
    }

    public boolean isAnonymous() {
        return userId == null;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public String getPublicId() {
        return publicId;
    }

    public void setPublicId(String publicId) {
        this.publicId = publicId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
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
        this.language = language;
    }

    public Visibility getVisibility() {
        return visibility;
    }

    public void setVisibility(Visibility visibility) {
        this.visibility = visibility;
    }

    public int getContentSizeBytes() {
        return contentSizeBytes;
    }

    public void setContentSizeBytes(int contentSizeBytes) {
        this.contentSizeBytes = contentSizeBytes;
    }

    public int getLineCount() {
        return lineCount;
    }

    public void setLineCount(int lineCount) {
        this.lineCount = lineCount;
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

    public Instant getLastEditedAt() {
        return lastEditedAt;
    }

    public void setLastEditedAt(Instant lastEditedAt) {
        this.lastEditedAt = lastEditedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Long getVersion() {
        return version;
    }

    public boolean isBurnAfterReading() {
        return burnAfterReading;
    }

    public void setBurnAfterReading(boolean burnAfterReading) {
        this.burnAfterReading = burnAfterReading;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public boolean isPasswordProtected() {
        return passwordHash != null && !passwordHash.isBlank();
    }

    public List<PasteFile> getFiles() {
        return files;
    }

    public void setFiles(List<PasteFile> files) {
        this.files = files;
    }

    public void addFile(PasteFile file) {
        if (file != null) {
            files.add(file);
            file.setPaste(this);
        }
    }

    public void clearFiles() {
        for (PasteFile file : files) {
            file.setPaste(null);
        }
        files.clear();
    }

    public long getViews() {
        return views;
    }

    public void setViews(long views) {
        this.views = views;
    }

    public List<PasteComment> getComments() {
        return comments;
    }

    public void setComments(List<PasteComment> comments) {
        this.comments = comments;
    }

    public void addComment(PasteComment comment) {
        if (comment != null) {
            comments.add(comment);
            comment.setPaste(this);
        }
    }

    public Folder getFolder() {
        return folder;
    }

    public void setFolder(Folder folder) {
        this.folder = folder;
    }

    public EncryptionMode getEncryptionMode() {
        return encryptionMode;
    }

    public void setEncryptionMode(EncryptionMode encryptionMode) {
        this.encryptionMode = encryptionMode;
    }

    public byte[] getKdfSalt() {
        return kdfSalt;
    }

    public void setKdfSalt(byte[] kdfSalt) {
        this.kdfSalt = kdfSalt;
    }

    public Integer getKdfIterations() {
        return kdfIterations;
    }

    public void setKdfIterations(Integer kdfIterations) {
        this.kdfIterations = kdfIterations;
    }

    public byte[] getWrappedKey() {
        return wrappedKey;
    }

    public void setWrappedKey(byte[] wrappedKey) {
        this.wrappedKey = wrappedKey;
    }

    public ShareAccessState getShareAccessState() {
        return shareAccessState;
    }

    public void setShareAccessState(ShareAccessState shareAccessState) {
        this.shareAccessState = shareAccessState;
    }

    public ModerationState getModerationState() {
        return moderationState;
    }

    public void setModerationState(ModerationState moderationState) {
        this.moderationState = moderationState;
    }

    public String getShareTokenHash() {
        return shareTokenHash;
    }

    public void setShareTokenHash(String shareTokenHash) {
        this.shareTokenHash = shareTokenHash;
    }

    public Instant getLinkRevokedAt() {
        return linkRevokedAt;
    }

    public void setLinkRevokedAt(Instant linkRevokedAt) {
        this.linkRevokedAt = linkRevokedAt;
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

    public long getStarsCount() {
        return starsCount;
    }

    public void setStarsCount(long starsCount) {
        this.starsCount = starsCount;
    }
}
