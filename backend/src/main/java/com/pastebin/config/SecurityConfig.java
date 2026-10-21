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
            .addFilterAfter(new CsrfCookieFilter(csrfCookieSameSite), CsrfFilter.class)
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
                .requestMatchers("/api/v1/account/**", "/api/v1/folders/**", "/api/v1/notifications/**", "/api/notifications/**").authenticated()
                .requestMatchers(
                    "/api/v1/pastes", "/api/v1/pastes/**",
                    "/api/pastes", "/api/pastes/**",
                    "/api/v1/replies", "/api/v1/replies/**",
                    "/api/replies", "/api/replies/**",
                    "/api/v1/auth/**",
                    "/api/v1/discovery/**",
                    "/p", "/p/**",
                    "/actuator/health/**", "/actuator/info", "/actuator/prometheus",
                    "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html",
                    "/error"
                ).permitAll()
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
