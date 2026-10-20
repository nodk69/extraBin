package com.pastebin;

import com.pastebin.shared.security.ClientIpResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Client IP Resolution & Anti-Spoofing Tests (SEC-01)")
class ClientIpResolverTest {

    // Configured with loopback and internal Docker CIDR as trusted proxies
    private final ClientIpResolver configuredResolver = new ClientIpResolver("127.0.0.1,::1,10.0.0.0/8,172.18.0.0/16");
    private final ClientIpResolver strictLoopbackResolver = new ClientIpResolver("127.0.0.1,::1");

    @Test
    @DisplayName("Uses X-Real-IP when peer is a verified trusted proxy")
    void usesXRealIpWhenPopulatedByTrustedProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "198.51.100.42");
        request.setRemoteAddr("10.0.0.5"); // matches 10.0.0.0/8

        String clientIp = configuredResolver.resolveClientIp(request);
        assertThat(clientIp).isEqualTo("198.51.100.42");
    }

    @Test
    @DisplayName("REJECTS spoofed X-Real-IP when direct connection arrives from untrusted remote address")
    void rejectsSpoofedXRealIpFromUntrustedDirectConnection() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "198.51.100.42"); // Attacker attempting to spoof IP
        request.setRemoteAddr("203.0.113.195"); // Untrusted direct TCP peer

        String clientIp = configuredResolver.resolveClientIp(request);
        // Must ignore the header and return the direct TCP peer address
        assertThat(clientIp).isEqualTo("203.0.113.195");
    }

    @Test
    @DisplayName("REJECTS spoofed X-Forwarded-For when connection arrives from untrusted remote address")
    void rejectsSpoofedXForwardedForFromUntrustedDirectConnection() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "1.1.1.1, 2.2.2.2");
        request.setRemoteAddr("203.0.113.50");

        String clientIp = configuredResolver.resolveClientIp(request);
        assertThat(clientIp).isEqualTo("203.0.113.50");
    }

    @Test
    @DisplayName("A trusted peer without X-Real-IP fails CLOSED to the peer address (XFF is not an identity source, P1-01)")
    void trustedPeerWithoutXRealIpDoesNotTrustXff() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "198.51.100.77, 10.0.0.1");
        request.setRemoteAddr("127.0.0.1");

        String clientIp = configuredResolver.resolveClientIp(request);
        // Hardened contract (P1-01): the leftmost XFF hop is client-controlled and must never
        // be adopted as identity; without the proxy's authoritative X-Real-IP the resolver
        // fails closed to the authentic peer address.
        assertThat(clientIp).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("Rejects malformed or header injection attempts in X-Real-IP")
    void rejectsMalformedIpInHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "1.2.3.4\r\nInjected-Header: evil");
        request.setRemoteAddr("127.0.0.1");

        String clientIp = configuredResolver.resolveClientIp(request);
        assertThat(clientIp).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("Rejects header when peer is outside configured CIDR subnet")
    void rejectsHeadersFromOutsideSubnet() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "198.51.100.42");
        request.setRemoteAddr("192.168.1.100"); // Not in strictLoopbackResolver

        String clientIp = strictLoopbackResolver.resolveClientIp(request);
        assertThat(clientIp).isEqualTo("192.168.1.100");
    }

    @Test
    @DisplayName("Handles IPv6 loopback trusted proxy")
    void handlesIpv6LoopbackTrustedProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "2001:db8::1");
        request.setRemoteAddr("0:0:0:0:0:0:0:1");

        String clientIp = strictLoopbackResolver.resolveClientIp(request);
        assertThat(clientIp).isEqualTo("2001:db8::1");
    }

    @Test
    @DisplayName("Handles null request safely")
    void handlesNullRequestSafely() {
        String clientIp = configuredResolver.resolveClientIp(null);
        assertThat(clientIp).isEqualTo("unknown");
    }
}
