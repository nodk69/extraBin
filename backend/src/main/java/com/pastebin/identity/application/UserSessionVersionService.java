package com.pastebin.identity.application;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.pastebin.identity.infrastructure.UserRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * Service managing user session versions for fast, low-latency session revocation (SEC-11).
 * Employs a bounded Caffeine cache with a 5-second TTL to avoid database overhead on every HTTP request
 * while guaranteeing immediate local invalidation and sub-5-second propagation across distributed replicas.
 */
@Service
public class UserSessionVersionService {

    private final UserRepository userRepository;

    // Cache active user session versions for 5 seconds to minimize database query contention
    private final Cache<Long, Long> sessionVersionCache = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofSeconds(5))
            .build();

    public UserSessionVersionService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Retrieves the authoritative session version for the specified user ID.
     *
     * @param userId the user's primary key
     * @return an Optional containing the current session version, or empty if the user does not exist
     */
    public Optional<Long> getActiveSessionVersion(Long userId) {
        if (userId == null) {
            return Optional.empty();
        }
        Long version = sessionVersionCache.get(userId, id -> userRepository.findSessionVersionById(id).orElse(null));
        return Optional.ofNullable(version);
    }

    /**
     * Immediately evicts cached version upon password change, reset, or manual session revocation.
     *
     * @param userId the user's primary key
     */
    public void invalidate(Long userId) {
        if (userId != null) {
            sessionVersionCache.invalidate(userId);
        }
    }

    /**
     * Updates the cache with the new version immediately.
     */
    public void update(Long userId, Long newVersion) {
        if (userId != null && newVersion != null) {
            sessionVersionCache.put(userId, newVersion);
        }
    }
}
