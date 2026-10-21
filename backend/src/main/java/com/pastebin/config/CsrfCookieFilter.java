package com.pastebin.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collection;

/**
 * Forces resolution of the deferred CSRF token on every request so that the
 * CookieCsrfTokenRepository writes the XSRF-TOKEN cookie even on GET responses.
 * The SPA reads this cookie and echoes it as the X-XSRF-TOKEN header on mutations.
 *
 * Also appends SameSite attribute to the XSRF-TOKEN cookie for cross-origin support.
 */
public class CsrfCookieFilter extends OncePerRequestFilter {

    private final String cookieSameSite;

    public CsrfCookieFilter() {
        this("Lax");
    }

    public CsrfCookieFilter(String cookieSameSite) {
        this.cookieSameSite = cookieSameSite;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrfToken == null) {
            csrfToken = (CsrfToken) request.getAttribute("_csrf");
        }
        if (csrfToken != null) {
            csrfToken.getToken();
        }

        if (!"Lax".equals(cookieSameSite)) {
            filterChain.doFilter(request, new SameSiteResponseWrapper(response, cookieSameSite));
        } else {
            filterChain.doFilter(request, response);
        }
    }

    private static class SameSiteResponseWrapper extends jakarta.servlet.http.HttpServletResponseWrapper {
        private final String sameSiteValue;

        SameSiteResponseWrapper(HttpServletResponse response, String sameSiteValue) {
            super(response);
            this.sameSiteValue = sameSiteValue;
        }

        @Override
        public void addHeader(String name, String value) {
            if ("Set-Cookie".equalsIgnoreCase(name) && value != null && value.startsWith("XSRF-TOKEN=")) {
                super.addHeader(name, appendSameSite(value));
            } else {
                super.addHeader(name, value);
            }
        }

        @Override
        public void setHeader(String name, String value) {
            if ("Set-Cookie".equalsIgnoreCase(name) && value != null && value.startsWith("XSRF-TOKEN=")) {
                super.setHeader(name, appendSameSite(value));
            } else {
                super.setHeader(name, value);
            }
        }

        @Override
        public void addDateHeader(String name, long date) { super.addDateHeader(name, date); }
        @Override
        public void addIntHeader(String name, int value) { super.addIntHeader(name, value); }
        @Override
        public void setDateHeader(String name, long date) { super.setDateHeader(name, date); }
        @Override
        public void setIntHeader(String name, int value) { super.setIntHeader(name, value); }

        private String appendSameSite(String cookieHeader) {
            String result = cookieHeader;
            if (!result.toLowerCase().contains("samesite=")) {
                result += "; SameSite=" + sameSiteValue;
            }
            if ("None".equals(sameSiteValue) && !result.toLowerCase().contains("secure")) {
                result += "; Secure";
            }
            return result;
        }
    }
}
