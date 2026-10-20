package com.pastebin.shared.security;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Authoritative client IP resolution component (SEC-01, hardened per audit finding P1-01).
 *
 * Trust model (documented contract):
 *  1. The trusted-proxy decision is ALWAYS made against the authentic TCP peer address,
 *     snapshotted by {@link PeerSnapshotFilter} before any forwarded-header rewriting
 *     (see WebConfig for ordering).
 *  2. Forwarding headers are honored ONLY when that peer is an explicitly configured
 *     trusted proxy. Of the proxy headers only X-Real-IP is honored — the value our
 *     nginx overwrites on every proxied route (see frontend/nginx.conf).
 *  3. X-Forwarded-For is NEVER used as an identity source: its leftmost entry is fully
 *     client-controlled (nginx appends the real peer), so honoring it would give
 *     attackers unlimited fresh rate-limit buckets.
 *  4. Untrusted callers always resolve to their own TCP peer address.
 *
 * The net effect for this deployment: honest clients behind the configured nginx are
 * bucketed by their real IP (from X-Real-IP); clients connecting directly (or a
 * spoofed value anywhere in the header chain) are bucketed by their own peer address.
 */
@Component
public class ClientIpResolver {

    private static final Logger log = LoggerFactory.getLogger(ClientIpResolver.class);
    private static final Pattern SAFE_IP_PATTERN = Pattern.compile("^[a-fA-F0-9:.]+$");

    private final List<IpMatcher> trustedProxyMatchers;

    public ClientIpResolver(@Value("${pastebin.security.trusted-proxies:127.0.0.1,::1}") String trustedProxiesConfig) {
        this.trustedProxyMatchers = parseTrustedProxies(trustedProxiesConfig);
    }

    public ClientIpResolver() {
        this("127.0.0.1,::1");
    }

    /**
     * Resolves the authoritative client IP.
     *
     * <ul>
     *   <li>Trust decision is made against the authentic TCP peer
     *       (peer snapshot attribute, falling back to request.getRemoteAddr()).</li>
     *   <li>X-Real-IP is trusted only from a trusted peer.</li>
     *   <li>X-Forwarded-For is never used as an identity source (P1-01).</li>
     * </ul>
     *
     * @param request the current HTTP servlet request
     * @return the verified client IP address
     */
    public String resolveClientIp(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }

        // 1. Authentic TCP peer — captured before ForwardedHeaderFilter could rewrite it.
        Object peerAttr = request.getAttribute(PeerSnapshotFilter.PEER_ADDRESS_ATTRIBUTE);
        String peer = (peerAttr instanceof String s && !s.isBlank()) ? s : request.getRemoteAddr();
        if (peer == null || peer.isBlank()) {
            return "unknown";
        }
        peer = peer.trim();

        // 2. Untrusted peer: discard ALL proxy headers; the caller is identified by its own address.
        if (!isTrustedProxy(peer)) {
            return SAFE_IP_PATTERN.matcher(peer).matches() ? peer : "unknown";
        }

        // 3. Trusted peer: honor only the proxy-managed header (nginx overwrites X-Real-IP on every proxied route).
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            String sanitized = realIp.trim();
            if (SAFE_IP_PATTERN.matcher(sanitized).matches()) {
                return sanitized;
            }
        }

        // 4. Trusted peer without X-Real-IP: fail CLOSED to the peer address. Without the
        //    proxy's authoritative header there is no trustworthy client identity;
        //    X-Forwarded-For would reintroduce P1-01 and is therefore not consulted.
        return SAFE_IP_PATTERN.matcher(peer).matches() ? peer : "unknown";
    }

    public boolean isTrustedProxy(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) {
            return false;
        }
        try {
            InetAddress address = InetAddress.getByName(ipAddress.trim());
            for (IpMatcher matcher : trustedProxyMatchers) {
                if (matcher.matches(address)) {
                    return true;
                }
            }
        } catch (UnknownHostException e) {
            log.warn("Failed to parse remote address for trusted proxy check: {}", ipAddress);
        }
        return false;
    }

    private static List<IpMatcher> parseTrustedProxies(String config) {
        List<IpMatcher> matchers = new ArrayList<>();
        if (config == null || config.isBlank()) {
            return matchers;
        }

        Arrays.stream(config.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .forEach(token -> {
                    try {
                        if (token.contains("/")) {
                            matchers.add(new CidrMatcher(token));
                        } else {
                            matchers.add(new ExactIpMatcher(InetAddress.getByName(token)));
                        }
                    } catch (Exception e) {
                        log.error("Failed to parse trusted proxy entry: '{}' - ignoring", token, e);
                    }
                });

        return matchers;
    }

    interface IpMatcher {
        boolean matches(InetAddress address);
    }

    static class ExactIpMatcher implements IpMatcher {
        private final InetAddress exactAddress;

        ExactIpMatcher(InetAddress exactAddress) {
            this.exactAddress = exactAddress;
        }

        @Override
        public boolean matches(InetAddress address) {
            return exactAddress.equals(address);
        }
    }

    static class CidrMatcher implements IpMatcher {
        private final byte[] networkBytes;
        private final int prefixLength;

        CidrMatcher(String cidr) throws UnknownHostException {
            String[] parts = cidr.split("/");
            if (parts.length != 2) {
                throw new IllegalArgumentException("Invalid CIDR format: " + cidr);
            }
            this.networkBytes = InetAddress.getByName(parts[0].trim()).getAddress();
            this.prefixLength = Integer.parseInt(parts[1].trim());
        }

        @Override
        public boolean matches(InetAddress address) {
            byte[] targetBytes = address.getAddress();
            if (targetBytes.length != networkBytes.length) {
                return false;
            }

            int fullBytes = prefixLength / 8;
            for (int i = 0; i < fullBytes; i++) {
                if (targetBytes[i] != networkBytes[i]) {
                    return false;
                }
            }

            int remainingBits = prefixLength % 8;
            if (remainingBits > 0 && fullBytes < targetBytes.length) {
                int mask = (~0) << (8 - remainingBits);
                return (targetBytes[fullBytes] & mask) == (networkBytes[fullBytes] & mask);
            }

            return true;
        }
    }
}
