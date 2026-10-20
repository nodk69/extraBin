package com.pastebin.paste.application;

import com.pastebin.shared.errors.UnauthorizedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

@Service
public class UnlockTokenService {

    private static final String TOKEN_VERSION = "v1";
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final byte[] secretBytes;
    private final long ttlSeconds;

    public UnlockTokenService(
            @Value("${pastebin.share.unlock-secret:default-unlock-secret-change-me-in-prod-32bytes}") String secret,
            @Value("${pastebin.share.unlock-ttl-seconds:600}") long ttlSeconds) {
        this.secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        this.ttlSeconds = ttlSeconds;
    }

    public record UnlockTokenPayload(String pasteId, Instant expiresAt, String normalizedIp) {}

    public record GeneratedToken(String token, Instant expiresAt) {}

    public GeneratedToken generateToken(String pasteId, String clientIp) {
        Instant expiresAt = Instant.now().plusSeconds(ttlSeconds);
        String normalizedIp = normalizeIp(clientIp);
        String payload = pasteId + ":" + expiresAt.getEpochSecond() + ":" + normalizedIp;
        String signature = hmacHex(payload);
        String token = TOKEN_VERSION + "." + base64UrlEncode(payload) + "." + signature;
        return new GeneratedToken(token, expiresAt);
    }

    /**
     * Validates the unlock token. Returns Optional.empty() when the token is structurally
     * valid but bound to a different paste (callers treat this as "no token for this paste").
     * Throws UnauthorizedException for tampered, expired, or IP-mismatched tokens.
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

        String[] payloadParts = payload.split(":", 3);
        if (payloadParts.length != 3) {
            throw new UnauthorizedException("Invalid unlock token.");
        }

        String pasteId = payloadParts[0];
        Instant expiresAt = Instant.ofEpochSecond(Long.parseLong(payloadParts[1]));
        String boundIp = payloadParts[2];

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
