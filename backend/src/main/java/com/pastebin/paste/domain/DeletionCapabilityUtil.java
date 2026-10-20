package com.pastebin.paste.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

public final class DeletionCapabilityUtil {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

    private DeletionCapabilityUtil() {}

    public static String generateCapability() {
        byte[] randomBytes = new byte[32]; // 256 bits
        SECURE_RANDOM.nextBytes(randomBytes);
        return "del_" + URL_ENCODER.encodeToString(randomBytes);
    }

    public static String hashCapability(String capability) {
        if (capability == null || capability.isBlank()) {
            throw new IllegalArgumentException("Capability must not be null or blank");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(capability.getBytes(StandardCharsets.UTF_8));
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

    public static boolean verifyCapability(String rawCapability, String storedHash) {
        if (rawCapability == null || storedHash == null) {
            return false;
        }
        String calculatedHash = hashCapability(rawCapability);
        return MessageDigest.isEqual(
                calculatedHash.getBytes(StandardCharsets.UTF_8),
                storedHash.getBytes(StandardCharsets.UTF_8)
        );
    }
}
