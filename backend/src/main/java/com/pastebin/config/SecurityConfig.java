package com.pastebin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.net.URI;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Value("${pastebin.cors.allowed-origins:http://localhost:5173}")
    private String allowedOrigins;

    @Value("${pastebin.csrf.cookie-secure:false}")
    private boolean csrfCookieSecure;

    @Value("${pastebin.csrf.cookie-same-site:Lax}")
    private String csrfCookieSameSite;

    private final com.pastebin.identity.application.UserSessionVersionService userSessionVersionService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SecurityConfig(com.pastebin.identity.application.UserSessionVersionService userSessionVersionService) {
        this.userSessionVersionService = userSessionVersionService;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public CookieCsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setSecure(csrfCookieSecure);
        // Applied to the Set-Cookie the repository itself writes. Browsers require
        // SameSite=None to be paired with Secure, otherwise the cookie is dropped and
        // every cross-origin mutation fails CSRF validation.
        repository.setCookieCustomizer(cookie -> {
            cookie.sameSite(csrfCookieSameSite);
            if ("None".equalsIgnoreCase(csrfCookieSameSite)) {
                cookie.secure(true);
            }
        });
        return repository;
    }

    @Bean
    public org.springframework.security.authentication.AuthenticationManager authenticationManager(
            org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration config
    ) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf
                .csrfTokenRepository(csrfTokenRepository())
                .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler())
            )
            .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
            .addFilterAfter(new com.pastebin.shared.security.SessionVersionValidationFilter(userSessionVersionService, objectMapper), CsrfCookieFilter.class)
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                .sessionFixation().migrateSession()
            )
            .headers(headers -> headers
                .contentTypeOptions(cto -> {})
                .frameOptions(fo -> fo.deny())
                .xssProtection(xss -> xss.disable()) // Superseded by modern CSP
                .referrerPolicy(ref -> ref.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives("default-src 'self'; script-src 'self' 'unsafe-inline' https://storage.ko-fi.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://storage.ko-fi.com https://ko-fi.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://ko-fi.com https://storage.ko-fi.com; frame-src 'self' https://ko-fi.com; frame-ancestors 'none'; form-action 'self' https://ko-fi.com; base-uri 'self'; object-src 'none';")
                )
            )
            .authorizeHttpRequests(auth -> auth
                // ── Authenticated: account, folders, notifications ─────────
                .requestMatchers(
                    "/api/v1/account/**",
                    "/api/v1/folders/**",
                    "/api/v1/notifications/**",
                    "/api/notifications/**"
                ).authenticated()

                // ── Authenticated: personal starred collection ─────────────
                // Must precede the broader paste GET matchers below.
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/pastes/starred")
                    .authenticated()

                // ── Public: auth endpoints ─────────────────────────────────
                .requestMatchers("/api/v1/auth/**").permitAll()

                // ── Public: discovery & author profiles ────────────────────
                .requestMatchers("/api/v1/discovery/**").permitAll()

                // ── Public: OG metadata HTML ───────────────────────────────
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/p", "/p/**").permitAll()

                // ── Public: paste read operations (explicit routes) ────────
                .requestMatchers(org.springframework.http.HttpMethod.GET,
                    "/api/v1/pastes/*",
                    "/api/v1/pastes/*/embed",
                    "/api/v1/pastes/*/share",
                    "/api/v1/pastes/*/raw",
                    "/api/v1/pastes/*/download",
                    "/api/v1/pastes/*/download-zip",
                    "/api/v1/pastes/*/comments",
                    "/api/v1/pastes/*/replies",
                    "/api/pastes/*/replies"
                ).permitAll()

                // ── Public: paste file read operations ─────────────────────
                .requestMatchers(org.springframework.http.HttpMethod.GET,
                    "/api/v1/pastes/*/files/**"
                ).permitAll()

                // ── Tag endpoints: URL-level permitAll, secured by @PreAuthorize("isAuthenticated()") on PasteTagController
                .requestMatchers(
                    "/api/v1/pastes/*/tags",
                    "/api/v1/pastes/*/tags/**"
                ).permitAll()

                // ── Public: paste creation ─────────────────────────────────
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes",
                    "/api/v1/pastes/encrypted",
                    "/api/pastes"
                ).permitAll()

                // ── Public: paste actions (unlock, telemetry) ──────────────
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes/*/unlock",
                    "/api/v1/pastes/*/decrypt-failed"
                ).permitAll()

                // ── Public: capability-protected ownership operations ──────
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes/*/delete-anonymous",
                    "/api/v1/pastes/*/revoke-link",
                    "/api/v1/pastes/*/rotate-link"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.PATCH,
                    "/api/v1/pastes/*/slug"
                ).permitAll()

                // ── Public: comments (post + capability delete) ────────────
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes/*/comments"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.DELETE,
                    "/api/v1/pastes/*/comments/*"
                ).permitAll()

                // ── Public: replies (create, edit, delete) ─────────────────
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes/*/replies",
                    "/api/pastes/*/replies"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.PATCH,
                    "/api/v1/replies/*",
                    "/api/replies/*"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.DELETE,
                    "/api/v1/replies/*",
                    "/api/replies/*"
                ).permitAll()

                // ── Public: voting (paste, comment, reply) ─────────────────
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes/*/vote",
                    "/api/v1/pastes/*/comments/*/vote",
                    "/api/v1/pastes/*/replies/*/vote",
                    "/api/pastes/*/replies/*/vote"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.DELETE,
                    "/api/v1/pastes/*/vote",
                    "/api/v1/pastes/*/comments/*/vote",
                    "/api/v1/pastes/*/replies/*/vote",
                    "/api/pastes/*/replies/*/vote"
                ).permitAll()

                // ── Public: starring (supports anonymous reaction service check)
                .requestMatchers(org.springframework.http.HttpMethod.POST,
                    "/api/v1/pastes/*/star"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.DELETE,
                    "/api/v1/pastes/*/star"
                ).permitAll()

                // ── Infrastructure ─────────────────────────────────────────
                .requestMatchers(
                    "/actuator/health", "/actuator/health/**",
                    "/actuator/info"
                ).permitAll()
                .requestMatchers("/actuator/prometheus")
                    .hasRole("ADMIN")

                // ── Swagger / API docs ─────────────────────────────────────
                .requestMatchers(
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html"
                ).permitAll()

                // ── Error page ─────────────────────────────────────────────
                .requestMatchers("/error").permitAll()

                // ── Secure default ─────────────────────────────────────────
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                    Map<String, Object> problem = Map.of(
                        "type", "https://pastebin.local/errors/unauthorized",
                        "title", "Unauthorized",
                        "status", 401,
                        "detail", "Authentication is required to access this resource",
                        "instance", request.getRequestURI(),
                        "code", "UNAUTHORIZED",
                        "timestamp", Instant.now().toString()
                    );
                    response.getWriter().write(objectMapper.writeValueAsString(problem));
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                    Map<String, Object> problem = Map.of(
                        "type", "https://pastebin.local/errors/forbidden",
                        "title", "Forbidden",
                        "status", 403,
                        "detail", "Access is denied to this resource",
                        "instance", request.getRequestURI(),
                        "code", "FORBIDDEN",
                        "timestamp", Instant.now().toString()
                    );
                    response.getWriter().write(objectMapper.writeValueAsString(problem));
                })
            );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(allowedOrigins.split(",")).map(String::trim).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of(
            "Authorization", "Content-Type", "X-XSRF-TOKEN", "Accept", "Origin",
            "X-Requested-With", "X-Correlation-ID", "X-Paste-Password", "X-Skip-View-Count", "X-Comment-Delete-Token",
            "X-Share-Token", "X-Paste-Unlock"
        ));
        config.setExposedHeaders(List.of("Location", "Retry-After", "X-XSRF-TOKEN", "X-CSRF-TOKEN", "X-Correlation-ID", "X-Comment-Delete-Token", "Content-Disposition", "X-Paste-Unlock"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    private static final class SpaCsrfTokenRequestHandler extends org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler {
        private final org.springframework.security.web.csrf.CsrfTokenRequestHandler delegate = new org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler();

        @Override
        public void handle(jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response, java.util.function.Supplier<org.springframework.security.web.csrf.CsrfToken> deferredCsrfToken) {
            this.delegate.handle(request, response, deferredCsrfToken);
        }

        @Override
        public String resolveCsrfTokenValue(jakarta.servlet.http.HttpServletRequest request, org.springframework.security.web.csrf.CsrfToken csrfToken) {
            String headerValue = request.getHeader(csrfToken.getHeaderName());
            return (org.springframework.util.StringUtils.hasText(headerValue))
                    ? super.resolveCsrfTokenValue(request, csrfToken)
                    : this.delegate.resolveCsrfTokenValue(request, csrfToken);
        }
    }
}
