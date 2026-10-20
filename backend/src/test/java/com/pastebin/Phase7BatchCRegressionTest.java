package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.PasswordResetConfirmRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.identity.domain.PasswordResetToken;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PasswordResetTokenRepository;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.DeletionCapabilityUtil;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regression tests for the Phase 7 Batch C hardenings:
 * P1-13 (reset-token revocation, P1-14 (bcrypt 72-byte limit),
 * P1-16 (OCC -> 409), P1-07 (discovery excludes view-once), P1-19 (Supabase
 * error redaction). Each test documents the finding it guards against.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class Phase7BatchCRegressionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;

    // ------------------------------------------------------------------
    // In-process stub standing in for Supabase's admin API (P1-19).
    // Registered via dynamic properties so this test class runs against it.
    // ------------------------------------------------------------------
    private static final String ATTACKER_ECHO_MARKER = "ATTACKER_ECHO_MARKER-DO_NOT_RETURN";

    private static final HttpServer supabaseStub;

    static {
        try {
            supabaseStub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            supabaseStub.createContext("/auth/v1/admin/users", exchange -> {
                // Deliberately reflects attacker-controllable content, mimicking the
                // upstream behaviour that leaked through before P1-19.
                byte[] body = ("{\"msg\":\"" + ATTACKER_ECHO_MARKER + "\",\"code\":500}")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(500, body.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(body);
                }
            });
            supabaseStub.start();
        } catch (IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void registerSupabaseStub(DynamicPropertyRegistry registry) {
        registry.add("supabase.url", () -> "http://127.0.0.1:" + supabaseStub.getAddress().getPort());
        registry.add("supabase.service-role-key", () -> "test-service-role-key");
    }

    private String uniqueSuffix() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    // ------------------------------------------------------------------
    // P1-13 — password reset token replay / parallel-token survival
    // ------------------------------------------------------------------

    @Test
    @DisplayName("P1-13: confirming a reset invalidates ALL outstanding tokens for the user")
    void passwordResetConfirmation_invalidatesAllOutstandingTokens() throws Exception {
        String suffix = uniqueSuffix();
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "ptoken_" + suffix, "ptoken_" + suffix + "@example.com", "OldPassword1!"))))
                .andExpect(status().isCreated());

        User user = userRepository.findByEmail("ptoken_" + suffix + "@example.com").orElseThrow();
        String rawTokenA = DeletionCapabilityUtil.generateCapability();
        String rawTokenB = DeletionCapabilityUtil.generateCapability();
        Instant expiresAt = Instant.now().plus(15, ChronoUnit.MINUTES);
        passwordResetTokenRepository.save(new PasswordResetToken(user.getId(), DeletionCapabilityUtil.hashCapability(rawTokenA), expiresAt));
        passwordResetTokenRepository.save(new PasswordResetToken(user.getId(), DeletionCapabilityUtil.hashCapability(rawTokenB), expiresAt));

        // First confirmation succeeds and must now delete every outstanding token.
        mockMvc.perform(post("/api/v1/auth/password-reset/confirm").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new PasswordResetConfirmRequest(
                                rawTokenA, "FreshPassword1!"))))
                .andExpect(status().isOk());

        // The parallel outstanding token must NOT survive the successful reset.
        mockMvc.perform(post("/api/v1/auth/password-reset/confirm").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new PasswordResetConfirmRequest(
                                rawTokenB, "HijackPassword1!"))))
                .andExpect(status().isForbidden());

        // And the new password actually applies (sanity check of the happy path).
        mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("ptoken_" + suffix, "FreshPassword1!"))))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------
    // P1-14 — bcrypt's real input limit is 72 bytes
    // ------------------------------------------------------------------

    @Test
    @DisplayName("P1-14: register with password of exactly 72 ASCII bytes is accepted (control)")
    void register_passwordExactly72Bytes_isAccepted() throws Exception {
        String suffix = uniqueSuffix();
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "bcrypt72_" + suffix, "bcrypt72_" + suffix + "@example.com", "a".repeat(72)))))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("P1-14: register with password above 72 UTF-8 bytes is rejected")
    void register_passwordAbove72Utf8Bytes_isRejected() throws Exception {
        String suffix = uniqueSuffix();
        // 80 ASCII characters = 80 bytes; the DTO allows up to 128 chars, so bean
        // validation alone would let this through to a truncated bcrypt hash.
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "bcrypt80_" + suffix, "bcrypt80_" + suffix + "@example.com", "a".repeat(80)))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("P1-14: multi-byte password whose UTF-8 size exceeds 72 bytes is rejected")
    void register_passwordMultibyteExceeding72Bytes_isRejected() throws Exception {
        String suffix = uniqueSuffix();
        // 60 CJK characters = 180 UTF-8 bytes but well within the character limit.
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "cjk60_" + suffix, "cjk60_" + suffix + "@example.com", "漢".repeat(60)))))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------
    // P1-16 — optimistic locking failures must surface as 409, not 500
    // ------------------------------------------------------------------

    @Test
    @DisplayName("P1-16: ObjectOptimisticLockingFailureException maps to 409 problem detail")
    void optimisticLockingFailure_isMappedTo409() {
        MockHttpServletRequest request = new MockHttpServletRequest("PUT", "/api/v1/pastes/x");
        var handler = new com.pastebin.shared.errors.ProblemDetailsExceptionHandler();
        var response = handler.handleOptimisticLocking(
                new ObjectOptimisticLockingFailureException(Object.class, 1L), request);

        org.junit.jupiter.api.Assertions.assertEquals(409, response.getStatusCode().value());
        org.junit.jupiter.api.Assertions.assertEquals("OPTIMISTIC_LOCK_CONFLICT",
                response.getBody().getProperties().get("code"));
    }

    // ------------------------------------------------------------------
    // P1-07 — discovery feed must not surface view-once pastes
    // ------------------------------------------------------------------

    @Test
    @DisplayName("P1-07: discovery listing excludes view-once (burn-after-reading) pastes")
    void discoveryExcludesViewOncePastes() throws Exception {
        String suffix = uniqueSuffix();

        String normalResult = mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreatePasteRequest(
                                "Normal Public " + suffix, "content of normal", "text", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String normalId = objectMapper.readTree(normalResult).get("id").asText();

        String viewOnceResult = mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreatePasteRequest(
                                "View Once " + suffix, "secret view once", "text", Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String viewOnceId = objectMapper.readTree(viewOnceResult).get("id").asText();

        mockMvc.perform(get("/api/v1/discovery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", org.hamcrest.Matchers.hasItem(normalId)))
                .andExpect(jsonPath("$.items[*].id", not(org.hamcrest.Matchers.hasItem(viewOnceId))));

        mockMvc.perform(get("/api/v1/discovery?language=text"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", not(org.hamcrest.Matchers.hasItem(viewOnceId))));
    }

    // ------------------------------------------------------------------
    // P1-19 — Supabase upstream failures must not reflect upstream messages
    // ------------------------------------------------------------------

    @Test
    @DisplayName("P1-19: supabase-signup failure returns a generic detail without the upstream message")
    void supabaseSignUp_upstreamFailure_isGeneric() throws Exception {
        String suffix = uniqueSuffix();
        mockMvc.perform(post("/api/v1/auth/supabase-signup").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "sbsignup_" + suffix, "sbsignup_" + suffix + "@example.com", "ValidPassword1!"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail", not(containsString(ATTACKER_ECHO_MARKER))))
                .andExpect(jsonPath("$.detail", containsString("Failed to register user in Supabase.")));
    }

    @Test
    @DisplayName("P1-14: supabase-signup rejects passwords above the 72-byte bcrypt limit before any upstream call")
    void supabaseSignUp_rejectsOversizedPassword() throws Exception {
        String suffix = uniqueSuffix();
        mockMvc.perform(post("/api/v1/auth/supabase-signup").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(
                                "sblong_" + suffix, "sblong_" + suffix + "@example.com", "b".repeat(90)))))
                .andExpect(status().isBadRequest());
    }
}
