package com.pastebin.identity.infrastructure;

import com.pastebin.identity.domain.UserFollow;
import com.pastebin.identity.domain.UserFollow.UserFollowId;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserFollowRepository extends JpaRepository<UserFollow, UserFollowId> {
    @Query("SELECT COUNT(f) FROM UserFollow f WHERE f.id.followedId = :followedId")
    long countByFollowedId(@Param("followedId") Long followedId);

    @Query("SELECT COUNT(f) FROM UserFollow f WHERE f.id.followerId = :followerId")
    long countByFollowerId(@Param("followerId") Long followerId);

    @Query("SELECT CASE WHEN COUNT(f) > 0 THEN true ELSE false END FROM UserFollow f WHERE f.id.followerId = :followerId AND f.id.followedId = :followedId")
    boolean existsByFollowerIdAndFollowedId(@Param("followerId") Long followerId, @Param("followedId") Long followedId);

    @Modifying
    @Query(value = "INSERT INTO user_follows (follower_id, followed_id, created_at) VALUES (:followerId, :followedId, :createdAt) ON CONFLICT (follower_id, followed_id) DO NOTHING", nativeQuery = true)
    int insertIfAbsent(@Param("followerId") Long followerId, @Param("followedId") Long followedId, @Param("createdAt") Instant createdAt);

    @Modifying
    @Query("DELETE FROM UserFollow f WHERE f.id.followerId = :followerId AND f.id.followedId = :followedId")
    int deleteRelationship(@Param("followerId") Long followerId, @Param("followedId") Long followedId);

    @Query("SELECT f.id.followerId FROM UserFollow f WHERE f.id.followedId = :userId ORDER BY f.createdAt DESC, f.id.followerId DESC")
    List<Long> findFollowerIds(@Param("userId") Long userId, Pageable pageable);

    @Query("SELECT f.id.followedId FROM UserFollow f WHERE f.id.followerId = :userId ORDER BY f.createdAt DESC, f.id.followedId DESC")
    List<Long> findFollowingIds(@Param("userId") Long userId, Pageable pageable);

    @Query("SELECT f.id.followedId FROM UserFollow f WHERE f.id.followerId = :viewerId AND f.id.followedId IN :ids")
    List<Long> findFollowedIdsByViewerAmong(@Param("viewerId") Long viewerId, @Param("ids") List<Long> ids);

    @Query("SELECT f.id.followedId, COUNT(f) FROM UserFollow f WHERE f.id.followedId IN :ids GROUP BY f.id.followedId")
    List<Object[]> countFollowersForUsers(@Param("ids") List<Long> ids);

    @Query("SELECT f.id.followerId, COUNT(f) FROM UserFollow f WHERE f.id.followerId IN :ids GROUP BY f.id.followerId")
    List<Object[]> countFollowingForUsers(@Param("ids") List<Long> ids);

    @Query("SELECT COUNT(f) FROM UserFollow f WHERE f.id.followedId = :followedId AND f.id.followerId = :viewerId")
    long countViewerFollow(@Param("viewerId") Long viewerId, @Param("followedId") Long followedId);
}
