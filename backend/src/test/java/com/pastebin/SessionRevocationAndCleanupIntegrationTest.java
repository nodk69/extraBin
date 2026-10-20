package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.PasswordResetConfirmRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.identity.application.AuthService;
import com.pastebin.identity.domain.PasswordResetToken;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PasswordResetTokenRepository;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.domain.DeletionCapabilityUtil;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.scheduler.ExpirationCleanupScheduler;
import com.pastebin.paste.scheduler.PastePurgeBatchService;
import com.pastebin.shared.security.RateLimiterService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext
@DisplayName("Session Revocation (SEC-11) & Chunked Cleanup Boundaries (SEC-04) Integration Tests")
class SessionRevocationAndCleanupIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private ExpirationCleanupScheduler expirationCleanupScheduler;

    @Autowired
    private PastePurgeBatchService pastePurgeBatchService;

    @Autowired
    private RateLimiterService rateLimiterService;

    @BeforeEach
    void resetState() {
        rateLimiterService.clear();
    }

    @Test
    @DisplayName("SEC-11: Password reset immediately revokes all pre-existing authenticated sessions")
    void passwordResetRevokesExistingSession() throws Exception {
        String username = "revoketestuser";
        String email = "revoketest@example.com";
        String initialPassword = "InitialPassword123!";
        String newPassword = "NewSecretPassword456!";

        // 1. Register user
        authService.register(new RegisterRequest(username, email, initialPassword), "127.0.0.1");

        // 2. Log in and establish session
        LoginRequest loginReq = new LoginRequest(username, initialPassword);
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession userSession = (MockHttpSession) loginResult.getRequest().getSession(false);
        assertThat(userSession).isNotNull();

        // 3. Verify active session can access protected account endpoint
        mockMvc.perform(get("/api/v1/account/pastes")
                        .session(userSession))
                .andExpect(status().isOk());

        // 4. Generate password reset token directly
        User user = userRepository.findByEmail(email).orElseThrow();
        String rawToken = DeletionCapabilityUtil.generateCapability();
        String tokenHash = DeletionCapabilityUtil.hashCapability(rawToken);
        PasswordResetToken resetToken = new PasswordResetToken(user.getId(), tokenHash, Instant.now().plus(15, ChronoUnit.MINUTES));
        passwordResetTokenRepository.save(resetToken);

        // 5. Confirm password reset
        PasswordResetConfirmRequest confirmReq = new PasswordResetConfirmRequest(rawToken, newPassword);
        mockMvc.perform(post("/api/v1/auth/password-reset/confirm")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(confirmReq)))
                .andExpect(status().isOk());

        // 6. Attempt to use the PREVIOUS session to access protected account endpoint
        // MUST BE REJECTED with 401 Unauthorized / Session Revoked
        mockMvc.perform(get("/api/v1/account/pastes")
                        .session(userSession))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));

        // 7. Old password no longer authenticates
        mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, initialPassword))))
                .andExpect(status().isUnauthorized());

        // 8. New password authenticates and creates a new valid session
        MvcResult newLoginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, newPassword))))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession newSession = (MockHttpSession) newLoginResult.getRequest().getSession(false);
        assertThat(newSession).isNotNull();

        mockMvc.perform(get("/api/v1/account/pastes")
                        .session(newSession))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("SEC-04: Batch deletion executes through independent transactions across chunks")
    void batchDeletionExecutesIndependently() {
        java.util.List<Long> insertedIds = new java.util.ArrayList<>();
        // Create 25 expired pastes
        for (int i = 0; i < 25; i++) {
            Paste p = new Paste(
                    "indepExp" + i,
                    null,
                    "Batch " + i,
                    "Content " + i,
                    "plaintext",
                    Visibility.PUBLIC,
                    10,
                    1,
                    null,
                    Instant.now().minusSeconds(7200)
            );
            insertedIds.add(pasteRepository.save(p).getId());
        }

        // Execute batch deletion directly through separate proxy bean in chunks of 10
        List<Long> chunk1 = insertedIds.subList(0, 10);
        int purged1 = pastePurgeBatchService.purgeBatchInNewTransaction(chunk1);
        assertThat(purged1).isEqualTo(10);

        List<Long> chunk2 = insertedIds.subList(10, 20);
        int purged2 = pastePurgeBatchService.purgeBatchInNewTransaction(chunk2);
        assertThat(purged2).isEqualTo(10);

        // Final chunk of 5
        List<Long> chunk3 = insertedIds.subList(20, 25);
        int purged3 = pastePurgeBatchService.purgeBatchInNewTransaction(chunk3);
        assertThat(purged3).isEqualTo(5);

        // Verify all 25 rows have been purged from the database
        for (Long id : insertedIds) {
            assertThat(pasteRepository.findById(id)).isEmpty();
        }
    }
}
