package com.pastebin.shared.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.application.UserSessionVersionService;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/**
 * Validates that authenticated requests hold an up-to-date session version (SEC-11).
 * When a user changes their password, all previous sessions become immediately invalid.
 */
public class SessionVersionValidationFilter extends OncePerRequestFilter {

    private final UserSessionVersionService userSessionVersionService;
    private final ObjectMapper objectMapper;

    public SessionVersionValidationFilter(UserSessionVersionService userSessionVersionService, ObjectMapper objectMapper) {
        this.userSessionVersionService = userSessionVersionService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication != null && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof PastebinUserPrincipal principal) {

            Optional<Long> activeVersionOpt = userSessionVersionService.getActiveSessionVersion(principal.getId());

            if (activeVersionOpt.isEmpty() || principal.getSessionVersion() < activeVersionOpt.get()) {
                // Session has been revoked by a password reset or manual invalidation
                SecurityContextHolder.clearContext();
                HttpSession session = request.getSession(false);
                if (session != null) {
                    session.invalidate();
                }

                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                Map<String, Object> problem = Map.of(
                        "type", "https://pastebin.local/errors/session-revoked",
                        "title", "Session Revoked",
                        "status", 401,
                        "detail", "Your session has expired or was revoked due to a password change. Please log in again.",
                        "instance", request.getRequestURI(),
                        "code", "SESSION_REVOKED",
                        "timestamp", Instant.now().toString()
                );
                response.getWriter().write(objectMapper.writeValueAsString(problem));
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}
