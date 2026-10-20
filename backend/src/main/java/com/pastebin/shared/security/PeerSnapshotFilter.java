package com.pastebin.shared.security;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

import java.io.IOException;

/**
 * Records the authentic TCP peer address (request.getRemoteAddr()) before any
 * forwarded-header processing can rewrite it.
 *
 * Audit context (P1-01): spring-web's ForwardedHeaderFilter rewrites
 * request.getRemoteAddr() to the leftmost, client-supplied X-Forwarded-For entry.
 * ClientIpResolver must therefore evaluate its trusted-proxy policy against the
 * ORIGINAL peer captured at the very front of the chain, never against a
 * rewritten value an attacker could have chosen.
 *
 * Ordering: registered via WebConfig with the highest precedence so it snapshots the
 * peer BEFORE ForwardedHeaderFilter runs. Not annotated @Component on purpose: it is
 * registered exactly once through its FilterRegistrationBean.
 */
public class PeerSnapshotFilter implements Filter {

    public static final String PEER_ADDRESS_ATTRIBUTE = PeerSnapshotFilter.class.getName() + ".PEER_ADDR";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request.getAttribute(PEER_ADDRESS_ATTRIBUTE) == null) {
            request.setAttribute(PEER_ADDRESS_ATTRIBUTE, request.getRemoteAddr());
        }
        chain.doFilter(request, response);
    }
}
