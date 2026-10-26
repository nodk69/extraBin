package com.pastebin.identity.application;

import com.pastebin.identity.api.dto.*;
import com.pastebin.identity.domain.PasswordResetToken;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PasswordResetTokenRepository;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.domain.DeletionCapabilityUtil;
import com.pastebin.shared.errors.ConflictException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.UnauthorizedException;
import com.pastebin.shared.security.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** Bounded so a pathological username collision cannot spin; three is ample in practice. */
    private static final int PROVISION_ATTEMPTS = 3;

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.anon-key:}")
    private String supabaseAnonKey;

    @Value("${supabase.service-role-key:}")
    private String supabaseServiceRoleKey;

    @Value("${server.servlet.session.cookie.secure:false}")
    private boolean sessionSecure;

    @Value("${server.servlet.session.cookie.same-site:lax}")
    private String sessionSameSite;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final RateLimiterService rateLimiterService;
    private final com.pastebin.shared.security.ClientIpResolver clientIpResolver;
    private final UserSessionVersionService userSessionVersionService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();
    private final SecurityContextHolderStrategy securityContextHolderStrategy = SecurityContextHolder.getContextHolderStrategy();
    private final TransactionTemplate provisioningTransaction;

    public AuthService(UserRepository userRepository,
                       PasswordResetTokenRepository passwordResetTokenRepository,
                       PasswordEncoder passwordEncoder,
                       AuthenticationManager authenticationManager,
                       RateLimiterService rateLimiterService,
                       com.pastebin.shared.security.ClientIpResolver clientIpResolver,
                       UserSessionVersionService userSessionVersionService,
                       PlatformTransactionManager transactionManager) {
        this.userRepository = userRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.rateLimiterService = rateLimiterService;
        this.clientIpResolver = clientIpResolver;
        this.userSessionVersionService = userSessionVersionService;
        this.provisioningTransaction = new TransactionTemplate(transactionManager);
        this.provisioningTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        return register(request, null);
    }

    @Transactional
    public UserResponse register(RegisterRequest request, String clientIp) {
        if (clientIp != null && !clientIp.isBlank()) {
            rateLimiterService.checkRateLimit("register:ip:" + clientIp, 5, 600);
        }

        assertPasswordByteLimit(request.password());

        if (userRepository.existsByUsername(request.username())) {
            throw new ConflictException("Username is already taken.");
        }
        if (userRepository.existsByEmail(request.email().toLowerCase().trim())) {
            throw new ConflictException("Email is already registered.");
        }

        User user = new User(
                request.username().trim(),
                request.email(),
                passwordEncoder.encode(request.password()),
                "ROLE_USER"
        );

        userRepository.save(user);

        return toUserResponse(user);
    }

    public UserResponse login(LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        rateLimiterService.checkRateLimit("login:ip:" + clientIp, 10, 60);

        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.usernameOrEmail(), request.password())
            );

            SecurityContext context = securityContextHolderStrategy.createEmptyContext();
            context.setAuthentication(authentication);
            securityContextHolderStrategy.setContext(context);
            securityContextRepository.saveContext(context, httpRequest, httpResponse);

            PastebinUserPrincipal principal = (PastebinUserPrincipal) authentication.getPrincipal();
            User user = userRepository.findById(principal.getId())
                    .orElseThrow(() -> new UnauthorizedException("User not found"));

            return toUserResponse(user);
        } catch (BadCredentialsException e) {
            throw new UnauthorizedException("Invalid username or password.");
        }
    }

    public void logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        SecurityContext context = securityContextHolderStrategy.getContext();
        context.setAuthentication(null);
        securityContextHolderStrategy.clearContext();
        securityContextRepository.saveContext(context, httpRequest, httpResponse);
        if (httpRequest.getSession(false) != null) {
            httpRequest.getSession().invalidate();
        }

        // Explicitly clear PASTESESSIONID cookie in response to prevent zombie sessions
        org.springframework.http.ResponseCookie cookie = org.springframework.http.ResponseCookie.from("PASTESESSIONID", "")
                .maxAge(0)
                .httpOnly(true)
                .path("/")
                .secure(sessionSecure)
                .sameSite(sessionSameSite)
                .build();
        httpResponse.addHeader(org.springframework.http.HttpHeaders.SET_COOKIE, cookie.toString());
    }

    @Transactional
    public String requestPasswordReset(PasswordResetRequest request, String clientIp) {
        rateLimiterService.checkRateLimit("pwd_reset:ip:" + clientIp, 5, 900);

        String email = request.email().toLowerCase().trim();
        
        // Check if user exists locally (for anti-enumeration, we proceed even if not found)
        boolean userExists = userRepository.findByEmail(email).isPresent();
        
        if (userExists) {
            // Delegate password reset to Supabase which handles email delivery
            sendPasswordResetViaSupabase(email);
        }

        // Always return generic response to prevent account enumeration
        return "If the account exists, password reset instructions have been dispatched.";
    }

    private void sendPasswordResetViaSupabase(String email) {
        if (supabaseUrl == null || supabaseUrl.isBlank() || supabaseAnonKey == null || supabaseAnonKey.isBlank()) {
            log.warn("Cannot send password reset email: Supabase is not configured");
            return;
        }

        try {
            // Use Supabase's password recovery endpoint with redirect to our reset page
            Map<String, Object> body = Map.of(
                "email", email,
                "redirect_to", "http://localhost:5173/auth/reset-password"
            );
            String json = objectMapper.writeValueAsString(body);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/auth/v1/recover"))
                    .header("apikey", supabaseAnonKey)
                    .header("Authorization", "Bearer " + supabaseAnonKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("Password reset email sent to {} via Supabase", email);
            } else {
                log.warn("Failed to send password reset email via Supabase: status={}, body={}", 
                    response.statusCode(), response.body());
            }
        } catch (Exception e) {
            log.error("Error sending password reset email to {} via Supabase: {}", email, e.getMessage());
        }
    }

    @Transactional
    public void confirmPasswordReset(PasswordResetConfirmRequest request) {
        assertPasswordByteLimit(request.newPassword());
        String tokenHash = DeletionCapabilityUtil.hashCapability(request.token());

        // P1-13: pessimistic row lock so a concurrent confirmation with the same token
        // cannot race past the validity check and double-use the token.
        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(() -> new ForbiddenException("Password reset token is invalid or has expired."));

        if (!resetToken.isValid(Instant.now())) {
            throw new ForbiddenException("Password reset token is invalid or has expired.");
        }

        User user = userRepository.findById(resetToken.getUserId())
                .orElseThrow(() -> new ForbiddenException("Associated user not found."));

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        // Sync new password to Supabase if configured so frontend sign-in doesn't lock out the user
        syncPasswordToSupabaseIfConfigured(user.getEmail(), request.newPassword());

        userSessionVersionService.update(user.getId(), user.getSessionVersion());
        userSessionVersionService.invalidate(user.getId());

        // P1-13: after a successful reset, remove every outstanding token for the user —
        // including older, not-yet-consumed tokens (they must not remain usable). Do NOT
        // re-save `resetToken` afterwards: its row is already gone (deleting it is the
        // stronger, equivalent-of-consumed state) and re-saving would resurrect it.
        passwordResetTokenRepository.deleteByUserId(user.getId());
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("Authentication required"));
        return toUserResponse(user);
    }

    public UserResponse toUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getRole(),
                user.isEmailVerified(),
                user.getCreatedAt()
        );
    }

    /**
     * P1-14: BCrypt's secret-size input is 72 bytes; longer inputs are truncated (or, on
     * some library paths, rejected). A password of 128 characters may be far more than
     * 72 UTF-8 bytes, silently collapsing different passwords onto the same hash prefix.
     * Enforcing the real bcrypt limit keeps "valid" passwords honest; the request DTO's
     * character-based range (8..128) alone is not sufficient.
     */
    private void assertPasswordByteLimit(String password) {
        if (password == null) {
            return;
        }
        int bytes = password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        if (bytes > 72) {
            throw new com.pastebin.shared.errors.BadRequestException(
                    "Password must be at most 72 bytes. Note: accented or non-Latin characters count as multiple bytes.");
        }
    }

    public void supabaseSignUp(RegisterRequest request) {
        supabaseSignUp(request, null);
    }

    public void supabaseSignUp(RegisterRequest request, String clientIp) {
        if (clientIp != null && !clientIp.isBlank()) {
            rateLimiterService.checkRateLimit("supabase-signup:ip:" + clientIp, 5, 600);
        }

        assertPasswordByteLimit(request.password());

        if (supabaseUrl.isBlank() || supabaseServiceRoleKey.isBlank()) {
            throw new ConflictException("Supabase is not configured on this server.");
        }
        try {
            Map<String, Object> body = Map.of(
                    "email", request.email().trim(),
                    "password", request.password(),
                    "email_confirm", true,
                    "user_metadata", Map.of("username", request.username().trim())
            );
            String json = objectMapper.writeValueAsString(body);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/auth/v1/admin/users"))
                    .header("apikey", supabaseServiceRoleKey)
                    .header("Authorization", "Bearer " + supabaseServiceRoleKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400 && response.statusCode() != 422) {
                try {
                    com.fasterxml.jackson.databind.JsonNode errNode = objectMapper.readTree(response.body());
                    String msg = errNode.path("msg").asText(errNode.path("message").asText("upstream error"));
                    // P1-19: upstream messages may echo attacker-controlled input (e.g. the
                    // submitted email). Log the detail server-side, return a generic detail.
                    log.warn("Supabase admin user provisioning returned {}: {}", response.statusCode(), msg);
                } catch (Exception ex) {
                    log.warn("Supabase admin user provisioning returned unparseable response: {}", response.statusCode());
                }
                throw new ConflictException("Failed to register user in Supabase.");
            }
        } catch (ConflictException ce) {
            throw ce;
        } catch (Exception e) {
            log.error("Supabase admin user provisioning failed", e);
            throw new ConflictException("Failed to register user in Supabase.");
        }

        userRepository.findByEmail(request.email().toLowerCase().trim()).orElseGet(() -> {
            String safeUsername = resolveUniqueUsername(request.username().trim());
            User user = new User(
                    safeUsername,
                    request.email().toLowerCase().trim(),
                    passwordEncoder.encode(request.password()),
                    "ROLE_USER"
            );
            user.setEmailVerified(true);
            return userRepository.save(user);
        });
    }

    @Transactional
    public UserResponse syncSupabaseUser(String accessToken,
                                         HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        rateLimiterService.checkRateLimit("supabase-sync:ip:" + clientIp, 20, 60);

        SupabaseIdentity identity = verifySupabaseAccessToken(accessToken);

        User user = provisionLocalUser(identity.email(), identity.username());

        PastebinUserPrincipal principal = new PastebinUserPrincipal(user);
        Authentication auth = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContext context = securityContextHolderStrategy.createEmptyContext();
        context.setAuthentication(auth);
        securityContextHolderStrategy.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        return toUserResponse(user);
    }

    /**
     * Finds or creates the local account for an already verified Supabase identity.
     *
     * <p>Provisioning is a check-then-act race by nature: two concurrent first logins for
     * one identity both see no row. The insert therefore goes through
     * {@link UserRepository#insertIfAbsent} ({@code ON CONFLICT DO NOTHING}), so the loser
     * writes nothing instead of raising 23505 — that is what previously poisoned the
     * session ({@code AssertionFailure: null id ... don't flush the Session after an
     * exception occurs}) and, on PostgreSQL, aborted the transaction ({@code 25P02}).
     *
     * <p>Each attempt runs in its own ({@code REQUIRES_NEW}) transaction. A skipped insert
     * means either our email or our candidate username was taken: the next attempt either
     * finds our email or re-resolves the username to the next free suffix. This also turns
     * the "username taken by a different identity" case into a success instead of a 401.
     */
    User provisionLocalUser(String email, String username) {
        // The native insert bypasses the entity constructor, which normalizes the address.
        String normalizedEmail = email.toLowerCase().trim();
        String base = username != null ? username : normalizedEmail.split("@")[0];
        for (int attempt = 1; attempt <= PROVISION_ATTEMPTS; attempt++) {
            try {
                User user = provisioningTransaction.execute(status -> attemptProvision(normalizedEmail, base));
                if (user != null) {
                    return user;
                }
                if (attempt < PROVISION_ATTEMPTS) {
                    log.debug("Account provisioning attempt {} lost a race; retrying on a fresh transaction.", attempt);
                }
            } catch (DataIntegrityViolationException ex) {
                // insertIfAbsent absorbs unique collisions; this is a last-resort guard so an
                // unexpected constraint still retries cleanly instead of returning a 500.
                log.debug("Account provisioning attempt {} failed on a constraint; retrying.", attempt);
            }
        }
        log.warn("Account provisioning did not converge after {} attempts for a verified Supabase identity.",
                PROVISION_ATTEMPTS);
        throw new UnauthorizedException("Unable to synchronize user session");
    }

    private User attemptProvision(String email, String base) {
        Optional<User> existing = userRepository.findByEmail(email);
        if (existing.isPresent()) {
            return existing.get();
        }
        int inserted = userRepository.insertIfAbsent(
                resolveUniqueUsername(base),
                email,
                passwordEncoder.encode(UUID.randomUUID().toString()));
        if (inserted == 0) {
            // The competing row is committed by now (the unique index made this wait), so
            // the caller's next attempt can read it or pick the next free username.
            return null;
        }
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UnauthorizedException("Unable to synchronize user session"));
    }

    private void syncPasswordToSupabaseIfConfigured(String email, String newPassword) {
        if (supabaseUrl == null || supabaseUrl.isBlank() || supabaseServiceRoleKey == null || supabaseServiceRoleKey.isBlank()) {
            return;
        }
        try {
            HttpRequest findUserReq = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/auth/v1/admin/users?page=1&per_page=50"))
                    .header("apikey", supabaseServiceRoleKey)
                    .header("Authorization", "Bearer " + supabaseServiceRoleKey)
                    .GET()
                    .timeout(Duration.ofSeconds(5))
                    .build();

            HttpResponse<String> findRes = httpClient.send(findUserReq, HttpResponse.BodyHandlers.ofString());
            if (findRes.statusCode() == 200) {
                com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(findRes.body());
                com.fasterxml.jackson.databind.JsonNode users = root.path("users");
                if (users.isArray()) {
                    for (com.fasterxml.jackson.databind.JsonNode u : users) {
                        String userEmail = u.path("email").asText("");
                        if (userEmail.equalsIgnoreCase(email.trim())) {
                            String supabaseUserId = u.path("id").asText();
                            if (!supabaseUserId.isBlank()) {
                                Map<String, Object> updateBody = Map.of("password", newPassword);
                                HttpRequest updateReq = HttpRequest.newBuilder()
                                        .uri(URI.create(supabaseUrl + "/auth/v1/admin/users/" + supabaseUserId))
                                        .header("apikey", supabaseServiceRoleKey)
                                        .header("Authorization", "Bearer " + supabaseServiceRoleKey)
                                        .header("Content-Type", "application/json")
                                        .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(updateBody)))
                                        .timeout(Duration.ofSeconds(5))
                                        .build();
                                HttpResponse<String> updateRes = httpClient.send(updateReq, HttpResponse.BodyHandlers.ofString());
                                log.info("Supabase password sync for {} returned status {}", email, updateRes.statusCode());
                                return;
                            }
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Failed to synchronize updated password to Supabase for {}: {}", email, ex.getMessage());
        }
    }

    /**
     * Verifies the Supabase access token against Supabase and returns the identity it authenticates.
     * Fails closed: any transport error, non-200 response, or missing email in the response is rejected.
     * The verified Supabase response is the only trusted source of identity; client-supplied
     * email/username fields are never used for authentication decisions.
     */
    private SupabaseIdentity verifySupabaseAccessToken(String accessToken) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            // Operator-facing only: the client still receives the same opaque 401.
            log.error("Supabase login rejected: supabase.url/supabase.anon-key are not configured");
            throw new UnauthorizedException("Supabase is not configured on this server.");
        }
        if (accessToken == null || accessToken.isBlank()) {
            log.warn("Supabase login rejected: the client sent an empty access token");
            throw new UnauthorizedException("A valid Supabase access token is required.");
        }
        try {
            HttpRequest verifyReq = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/auth/v1/user"))
                    .header("apikey", supabaseAnonKey)
                    .header("Authorization", "Bearer " + accessToken)
                    .GET()
                    .timeout(Duration.ofSeconds(5))
                    .build();

            HttpResponse<String> verifyRes = httpClient.send(verifyReq, HttpResponse.BodyHandlers.ofString());
            if (verifyRes.statusCode() != 200) {
                // Never log the token itself or the email it carries: the length alone
                // separates "no token reached us" from "Supabase rejected a real one".
                log.warn("Supabase token verification rejected by upstream: status={}, tokenLength={}",
                        verifyRes.statusCode(), accessToken.length());
                throw new UnauthorizedException("Supabase access token verification failed.");
            }

            com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(verifyRes.body());
            String email = node.path("email").asText(null);
            if (email == null || email.isBlank()) {
                log.warn("Supabase token verification returned no email claim");
                throw new UnauthorizedException("Supabase access token verification failed.");
            }

            return new SupabaseIdentity(email.toLowerCase().trim(), resolveSupabaseUsername(node));
        } catch (UnauthorizedException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Supabase token verification failed before reaching a response: {}", e.toString());
            throw new UnauthorizedException("Supabase access token verification failed.");
        }
    }

    private String resolveSupabaseUsername(com.fasterxml.jackson.databind.JsonNode node) {
        com.fasterxml.jackson.databind.JsonNode metadata = node.path("user_metadata");
        for (String key : new String[]{"username", "user_name", "full_name", "name"}) {
            String candidate = metadata.path(key).asText(null);
            if (candidate != null && !candidate.isBlank()) {
                return candidate.trim();
            }
        }
        return null;
    }

    private record SupabaseIdentity(String email, String username) {}

    private String resolveUniqueUsername(String base) {
        String candidate = base.replaceAll("[^a-zA-Z0-9_-]", "_");
        if (candidate.isBlank()) {
            candidate = "user_" + (System.currentTimeMillis() % 10000);
        }
        if (!userRepository.existsByUsername(candidate)) {
            return candidate;
        }
        for (int i = 1; i <= 20; i++) {
            String test = candidate + "_" + i;
            if (!userRepository.existsByUsername(test)) {
                return test;
            }
        }
        return candidate + "_" + (System.currentTimeMillis() % 10000);
    }
}
