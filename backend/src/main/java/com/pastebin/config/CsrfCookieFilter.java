package com.pastebin.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.DeferredCsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Forces resolution of the deferred CSRF token on every request so that the
 * CookieCsrfTokenRepository writes the XSRF-TOKEN cookie even on GET responses.
 *
 * <p>Cross-origin fix: the XSRF-TOKEN cookie is set on the backend domain and is
 * invisible to document.cookie on the frontend domain. To make the token value
 * accessible to the frontend JavaScript, we also set it as a response header
 * (X-CSRF-TOKEN) which the frontend reads from the bootstrap response and exposes
 * through the CORS exposed-headers list.
 *
 * <p>The cookie's {@code SameSite}/{@code Secure} attributes are applied by
 * {@link SecurityConfig#csrfTokenRepository()} through
 * {@code CookieCsrfTokenRepository#setCookieCustomizer}. They deliberately are not
 * patched here: Spring Security saves the cookie from a token captured before this
 * filter runs, so a response wrapper at this position never observes the write.
 *
 * <p>The exposed value is the <em>raw</em> token, not the XOR-masked one that
 * {@link SecurityConfig}'s {@code SpaCsrfTokenRequestHandler} installs as the
 * {@code _csrf} request attribute (that masked form exists for rendering into
 * HTML). The frontend echoes this header back in {@code X-XSRF-TOKEN}, which
 * Spring Security validates with the plain handler against the raw token in the
 * {@code XSRF-TOKEN} cookie; publishing the masked attribute made every
 * cross-origin mutation fail with 403.
 */
public class CsrfCookieFilter extends OncePerRequestFilter {

    private static final String CSRF_RESPONSE_HEADER = "X-CSRF-TOKEN";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        CsrfToken csrfToken = resolveRawToken(request);
        if (csrfToken != null) {
            response.setHeader(CSRF_RESPONSE_HEADER, csrfToken.getToken());
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Returns the raw CSRF token, generating and persisting it on a cold request.
     * The {@link DeferredCsrfToken} installed by {@code CsrfFilter} resolves to the
     * raw value; the request attributes hold the XOR-masked value and are only a
     * last-resort fallback.
     */
    private CsrfToken resolveRawToken(HttpServletRequest request) {
        DeferredCsrfToken deferredCsrfToken =
                (DeferredCsrfToken) request.getAttribute(DeferredCsrfToken.class.getName());
        if (deferredCsrfToken != null) {
            return deferredCsrfToken.get();
        }
        CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrfToken == null) {
            csrfToken = (CsrfToken) request.getAttribute("_csrf");
        }
        return csrfToken;
    }
}
