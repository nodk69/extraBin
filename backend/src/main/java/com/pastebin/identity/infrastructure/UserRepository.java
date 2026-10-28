package com.pastebin.identity.infrastructure;

import com.pastebin.identity.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    @Query("SELECT u FROM User u WHERE u.username = :login OR u.email = LOWER(:login)")
    Optional<User> findByUsernameOrEmail(@Param("login") String login);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    @Query("SELECT u.id, u.username FROM User u WHERE u.id IN :ids")
    java.util.List<Object[]> findUsernamesByIds(@Param("ids") java.util.Collection<Long> ids);

    @Query(value = "SELECT u.id FROM users u WHERE (:viewerId IS NULL OR NOT EXISTS (SELECT 1 FROM user_follows f WHERE f.follower_id = :viewerId AND f.followed_id = u.id)) ORDER BY (SELECT COUNT(*) FROM pastes p WHERE p.user_id = u.id AND p.visibility = 'PUBLIC' AND (p.expires_at IS NULL OR p.expires_at > :now) AND p.burn_after_reading = FALSE AND p.password_hash IS NULL AND p.encryption_mode IS NULL AND p.moderation_state = 'ACTIVE') DESC, u.created_at DESC, u.id DESC", countQuery = "SELECT COUNT(u.id) FROM users u WHERE (:viewerId IS NULL OR NOT EXISTS (SELECT 1 FROM user_follows f WHERE f.follower_id = :viewerId AND f.followed_id = u.id))", nativeQuery = true)
    org.springframework.data.domain.Page<Long> findDiscoverableDeveloperIds(@Param("viewerId") Long viewerId,
                                                                            @Param("now") java.time.Instant now,
                                                                            org.springframework.data.domain.Pageable pageable);

    @Query("SELECT u.sessionVersion FROM User u WHERE u.id = :id")
    Optional<Long> findSessionVersionById(@Param("id") Long id);

    /**
     * Atomic "create if absent" for Supabase-provisioned accounts.
     *
     * <p>Without a conflict target, {@code ON CONFLICT DO NOTHING} absorbs a collision on
     * <em>either</em> unique constraint ({@code uq_users_email} or {@code uq_users_username})
     * instead of raising 23505. Two concurrent first logins therefore cannot poison a
     * transaction or log a SQL error. A concurrent duplicate blocks on the unique index
     * until the competing transaction ends, so by the time this returns {@code 0} the
     * winner's row is committed and visible to the caller's next read.
     *
     * <p>Only the columns without a database default are supplied: {@code role},
     * {@code created_at}, {@code updated_at}, {@code session_version} and
     * {@code notify_on_replies} and {@code notify_on_follows} are filled by table defaults established in
     * {@code V1__init_schema.sql}, {@code V6} and {@code V9}. A future NOT NULL column
     * without a default must be added here.
     *
     * @return {@code 1} when the row was created, {@code 0} when a unique constraint was
     *         already satisfied by an existing row
     */
    @Modifying
    @Query(value = """
            INSERT INTO users (username, email, password_hash, role, email_verified, notify_on_replies, notify_on_follows, session_version, created_at, updated_at)
            VALUES (:username, :email, :passwordHash, 'ROLE_USER', TRUE, TRUE, TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("username") String username,
                       @Param("email") String email,
                       @Param("passwordHash") String passwordHash);
}
