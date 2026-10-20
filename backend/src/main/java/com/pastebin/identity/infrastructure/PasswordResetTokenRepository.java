package com.pastebin.identity.infrastructure;

import com.pastebin.identity.domain.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * P1-13: optimistic (implicitly read) lookups let two concurrent confirmations with the
     * same token both pass {@code isValid} before either commits. The pessimistic lock
     * serializes confirmations on the token row; a second caller re-reads the row after the
     * first commits and sees it consumed.
     */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM PasswordResetToken t WHERE t.tokenHash = :tokenHash")
    Optional<PasswordResetToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM PasswordResetToken t WHERE t.expiresAt <= :now OR t.consumedAt IS NOT NULL")
    int deleteExpiredOrUsedTokens(@Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM PasswordResetToken t WHERE t.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
