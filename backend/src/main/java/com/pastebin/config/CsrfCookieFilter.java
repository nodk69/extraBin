package com.pastebin.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
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
 */
public class CsrfCookieFilter extends OncePerRequestFilter {

    private static final String CSRF_RESPONSE_HEADER = "X-CSRF-TOKEN";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrfToken == null) {
            csrfToken = (CsrfToken) request.getAttribute("_csrf");
        }
        if (csrfToken != null) {
            String tokenValue = csrfToken.getToken();
            response.setHeader(CSRF_RESPONSE_HEADER, tokenValue);
        }

        filterChain.doFilter(request, response);
    }
}
