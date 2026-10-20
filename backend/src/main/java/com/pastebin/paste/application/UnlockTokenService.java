package com.pastebin.paste.application;

import com.pastebin.shared.errors.UnauthorizedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * Issues and validates short-lived unlock tokens for password-protected pastes.
 *
 * <p>Token format: {@code v1.<base64url(purpose:pasteId:expiresAt:ip)>.<hex-hmac>} where the
 * HMAC is SHA-256 over the encoded payload, keyed with the configured shared secret. The
 * secret is taken as UTF-8 bytes and production requires at least 32 bytes (256 bits).</p>
 *
 * <p>Key rotation policy: a single key is accepted at a time. Changing
 * {@code pastebin.share.unlock-secret} immediately invalidates every token issued with the
 * previous key; there is no dual-key acceptance window. Because tokens live for at most
 * {@code pastebin.share.unlock-ttl-seconds} (10 minutes by default), the cost of a rotation
 * is bounded to in-flight unlock handshakes, which simply have to unlock again.</p>
 */
@Service
public class UnlockTokenService {

    private static final Logger log = LoggerFactory.getLogger(UnlockTokenService.class);

    private static final String TOKEN_VERSION = "v1";
    private static final String TOKEN_PURPOSE = "unlock";
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    /** Minimum key material for HMAC-SHA256: one 256-bit key. */
    static final int MIN_SECRET_BYTES = 32;

    /**
     * The retired development fallback. It is public knowledge, so a production deployment
     * that still sets it is treated exactly like a missing secret.
     */
    public static final String RETIRED_DEVELOPMENT_SECRET = "default-unlock-secret-change-me-in-prod-32bytes";

    private static final int EPHEMERAL_SECRET_BYTES = 32;

    private final byte[] secretBytes;
    private final long ttlSeconds;

    public UnlockTokenService(
            Environment environment,
            @Value("${pastebin.share.unlock-secret:}") String configuredSecret,
            @Value("${pastebin.share.unlock-ttl-seconds:600}") long ttlSeconds) {
        this.secretBytes = resolveSecret(environment, configuredSecret);
        if (ttlSeconds <= 0) {
            throw new IllegalStateException(
                    "Refusing to start: pastebin.share.unlock-ttl-seconds must be a positive number of seconds.");
        }
        this.ttlSeconds = ttlSeconds;
    }

    /**
     * Resolves the HMAC key. Production (profiles {@code prod}/{@code production}) fails closed:
     * an absent, blank, whitespace-padded, retired-default, or too-short secret aborts startup.
     * Non-production profiles fall back to a random per-process key so local development and
     * tests never run with a predictable secret.
     */
    private static byte[] resolveSecret(Environment environment, String configuredSecret) {
        boolean production = environment != null
                && environment.acceptsProfiles(Profiles.of("prod", "production"));
        String secret = configuredSecret == null ? "" : configuredSecret;

        if (production) {
            String problem = productionProblem(secret);
            if (problem != null) {
                throw new IllegalStateException(
                        "Refusing to start: the production unlock-token secret " + problem + ". "
                                + "Set PASTEBIN_SHARE_UNLOCK_SECRET to at least " + MIN_SECRET_BYTES
                                + " bytes of UTF-8 key material (for example: openssl rand -base64 32).");
            }
            return secret.getBytes(StandardCharsets.UTF_8);
        }

        if (secret.isBlank()) {
            byte[] ephemeral = new byte[EPHEMERAL_SECRET_BYTES];
            new SecureRandom().nextBytes(ephemeral);
            log.warn("pastebin.share.unlock-secret is not set; using an ephemeral development-only key. "
                    + "Unlock tokens stop working when this process restarts.");
            return ephemeral;
        }

        return secret.getBytes(StandardCharsets.UTF_8);
    }

    private static String productionProblem(String secret) {
        if (secret.isBlank()) {
            return "is missing or blank";
        }
        if (!secret.equals(secret.trim())) {
            return "has leading or trailing whitespace";
        }
        if (RETIRED_DEVELOPMENT_SECRET.equals(secret)) {
            return "is set to the retired public development default";
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            return "is shorter than the required " + MIN_SECRET_BYTES + " bytes of UTF-8";
        }
        return null;
    }

    public record UnlockTokenPayload(String pasteId, Instant expiresAt, String normalizedIp) {}

    public record GeneratedToken(String token, Instant expiresAt) {}

    public GeneratedToken generateToken(String pasteId, String clientIp) {
        Instant expiresAt = Instant.now().plusSeconds(ttlSeconds);
        String normalizedIp = normalizeIp(clientIp);
        String payload = TOKEN_PURPOSE + ":" + pasteId + ":" + expiresAt.getEpochSecond() + ":" + normalizedIp;
        String signature = hmacHex(payload);
        String token = TOKEN_VERSION + "." + base64UrlEncode(payload) + "." + signature;
        return new GeneratedToken(token, expiresAt);
    }

    /**
     * Validates the unlock token. Returns Optional.empty() when the token is structurally
     * valid but bound to a different paste (callers treat this as "no token for this paste").
     * Throws UnauthorizedException for tampered, malformed, wrong-purpose, expired, or
     * IP-mismatched tokens.
     */
    public Optional<UnlockTokenPayload> validateToken(String token, String expectedPasteId, String clientIp) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }

        String[] parts = token.split("\\.");
        if (parts.length != 3 || !TOKEN_VERSION.equals(parts[0])) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        String payload;
        try {
            payload = base64UrlDecode(parts[1]);
        } catch (Exception e) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        String expectedSignature = hmacHex(payload);
        if (!MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                parts[2].getBytes(StandardCharsets.UTF_8))) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        String[] payloadParts = payload.split(":", 4);
        if (payloadParts.length != 4 || !TOKEN_PURPOSE.equals(payloadParts[0])) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        Instant expiresAt;
        try {
            expiresAt = Instant.ofEpochSecond(Long.parseLong(payloadParts[2]));
        } catch (RuntimeException e) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        String pasteId = payloadParts[1];
        String boundIp = payloadParts[3];

        if (!pasteId.equals(expectedPasteId)) {
            return Optional.empty();
        }

        if (Instant.now().isAfter(expiresAt)) {
            throw new UnauthorizedException("Unlock token has expired.");
        }

        String normalizedClientIp = normalizeIp(clientIp);
        if (!boundIp.equals(normalizedClientIp)) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        return Optional.of(new UnlockTokenPayload(pasteId, expiresAt, boundIp));
    }

    private String normalizeIp(String ip) {
        if (ip == null || ip.isBlank()) {
            return "unknown";
        }
        try {
            InetAddress address = InetAddress.getByName(ip.trim());
            return address.getHostAddress();
        } catch (Exception e) {
            return ip.trim();
        }
    }

    private String hmacHex(String data) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secretBytes, HMAC_ALGORITHM));
            byte[] hmacBytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hmacBytes) {
                String h = Integer.toHexString(0xff & b);
                if (h.length() == 1) hex.append('0');
                hex.append(h);
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("HMAC computation failed", e);
        }
    }

    private String base64UrlEncode(String data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data.getBytes(StandardCharsets.UTF_8));
    }

    private String base64UrlDecode(String encoded) {
        return new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
    }
}
