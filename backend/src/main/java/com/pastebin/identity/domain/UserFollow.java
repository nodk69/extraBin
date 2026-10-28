package com.pastebin.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "user_follows")
public class UserFollow {

    @EmbeddedId
    private UserFollowId id;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected UserFollow() {}

    public UserFollow(Long followerId, Long followedId) {
        this.id = new UserFollowId(followerId, followedId);
        this.createdAt = Instant.now();
    }

    public Long getFollowerId() { return id.getFollowerId(); }
    public Long getFollowedId() { return id.getFollowedId(); }
    public Instant getCreatedAt() { return createdAt; }

    @Embeddable
    public static class UserFollowId implements Serializable {
        @Column(name = "follower_id", nullable = false)
        private Long followerId;
        @Column(name = "followed_id", nullable = false)
        private Long followedId;

        protected UserFollowId() {}
        public UserFollowId(Long followerId, Long followedId) {
            this.followerId = followerId;
            this.followedId = followedId;
        }
        public Long getFollowerId() { return followerId; }
        public Long getFollowedId() { return followedId; }

        @Override public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof UserFollowId that)) return false;
            return Objects.equals(followerId, that.followerId) && Objects.equals(followedId, that.followedId);
        }
        @Override public int hashCode() { return Objects.hash(followerId, followedId); }
    }
}
