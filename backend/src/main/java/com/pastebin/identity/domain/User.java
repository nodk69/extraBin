package com.pastebin.identity.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, unique = true, length = 50)
    private String username;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "role", nullable = false, length = 30)
    private String role;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    @Column(name = "session_version", nullable = false)
    private Long sessionVersion = 1L;

    @Column(name = "notify_on_replies", nullable = false)
    private boolean notifyOnReplies = true;

    @Column(name = "notify_on_follows", nullable = false)
    private boolean notifyOnFollows = true;

    @Column(name = "display_name", length = 80)
    private String displayName;

    @Column(name = "bio", length = 500)
    private String bio;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    @Column(name = "github_url", length = 255)
    private String githubUrl;

    @Column(name = "linkedin_url", length = 255)
    private String linkedinUrl;

    @Column(name = "x_url", length = 255)
    private String xUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public User() {
    }

    public User(String username, String email, String passwordHash, String role) {
        this.username = username;
        this.email = email.toLowerCase().trim();
        this.passwordHash = passwordHash;
        this.role = role != null ? role : "ROLE_USER";
        this.emailVerified = false;
        this.sessionVersion = 1L;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email.toLowerCase().trim();
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
        this.sessionVersion = (this.sessionVersion != null ? this.sessionVersion : 1L) + 1;
        this.updatedAt = Instant.now();
    }

    public Long getSessionVersion() {
        return sessionVersion != null ? sessionVersion : 1L;
    }

    public void incrementSessionVersion() {
        this.sessionVersion = (this.sessionVersion != null ? this.sessionVersion : 1L) + 1;
        this.updatedAt = Instant.now();
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    public boolean isNotifyOnReplies() {
        return notifyOnReplies;
    }

    public void setNotifyOnReplies(boolean notifyOnReplies) {
        this.notifyOnReplies = notifyOnReplies;
    }

    public boolean isNotifyOnFollows() {
        return notifyOnFollows;
    }

    public void setNotifyOnFollows(boolean notifyOnFollows) {
        this.notifyOnFollows = notifyOnFollows;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
        touch();
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
        touch();
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
        touch();
    }

    public String getGithubUrl() {
        return githubUrl;
    }

    public void setGithubUrl(String githubUrl) {
        this.githubUrl = githubUrl;
        touch();
    }

    public String getLinkedinUrl() {
        return linkedinUrl;
    }

    public void setLinkedinUrl(String linkedinUrl) {
        this.linkedinUrl = linkedinUrl;
        touch();
    }

    public String getXUrl() {
        return xUrl;
    }

    public void setXUrl(String xUrl) {
        this.xUrl = xUrl;
        touch();
    }

    private void touch() {
        this.updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
