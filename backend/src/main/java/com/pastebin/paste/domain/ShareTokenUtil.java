package com.pastebin.paste.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Utility for cryptographically secure share token generation, format validation,
 * SHA-256 hashing, and constant-time token comparison.
 */
public final class ShareTokenUtil {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    public static final String TOKEN_PREFIX = "shr_";

    private ShareTokenUtil() {}

    /**
     * Generates a cryptographically strong 256-bit URL-safe share token with "shr_" prefix.
     * Length: 4 + 43 = 47 characters.
     */
    public static String generateShareToken() {
        byte[] randomBytes = new byte[32]; // 256 bits entropy
        SECURE_RANDOM.nextBytes(randomBytes);
        return TOKEN_PREFIX + URL_ENCODER.encodeToString(randomBytes);
    }

    /**
     * Validates whether the given raw token has the expected format.
     */
    public static boolean isValidFormat(String rawToken) {
        if (rawToken == null || !rawToken.startsWith(TOKEN_PREFIX)) {
            return false;
        }
        return rawToken.matches("^shr_[A-Za-z0-9_-]{43}$");
    }

    /**
     * Calculates the lowercase hex-encoded SHA-256 hash of the given raw share token.
     */
    public static String hashToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("Share token must not be null or blank");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }

    /**
     * Constant-time comparison between raw token and stored SHA-256 hash.
     */
    public static boolean verifyToken(String rawToken, String storedHash) {
        if (!isValidFormat(rawToken) || storedHash == null || storedHash.isBlank()) {
            return false;
        }
        String calculatedHash = hashToken(rawToken);
        return MessageDigest.isEqual(
                calculatedHash.getBytes(StandardCharsets.UTF_8),
                storedHash.getBytes(StandardCharsets.UTF_8)
        );
    }
}
