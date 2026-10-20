package com.pastebin;

import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.application.PasteService;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.scheduler.ExpirationCleanupScheduler;
import com.pastebin.shared.security.RateLimiterService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext
@DisplayName("Batch 2 Security Regression Tests (SEC-03, SEC-04, SEC-06, SEC-09)")
class Batch2SecurityRegressionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteService pasteService;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private ExpirationCleanupScheduler expirationCleanupScheduler;

    @Autowired
    private RateLimiterService rateLimiterService;

    @BeforeEach
    void resetState() {
        rateLimiterService.clear();
    }

    @org.junit.jupiter.api.AfterEach
    void cleanUp() {
        rateLimiterService.clear();
    }

    @Test
    @DisplayName("SEC-03: Password in query parameter is rejected; X-Paste-Password header required")
    void testPasswordInQueryParameterIsRejected() throws Exception {
        // Create password protected paste (PUBLIC visibility to isolate password-query rejection from token gate)
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Secret Notes",
                "Top secret data",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER,
                "vault-pass-42"
        );
        CreatePasteResponse created = pasteService.createPaste(createReq, null, "192.0.2.1");

        // 1. Attempting with ?password= in URL query DOES NOT unlock content (passwordRequired remains true, content is masked)
        mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .param("password", "vault-pass-42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(true))
                .andExpect(jsonPath("$.content").value(""));

        // 2. Attempting with ?password= on /raw endpoint MUST FAIL (401 Unauthorized)
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/raw")
                        .param("password", "vault-pass-42"))
                .andExpect(status().isUnauthorized());

        // 3. Providing password in X-Paste-Password header MUST SUCCEED (200 with unlocked content)
        mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Paste-Password", "vault-pass-42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Secret Notes"))
                .andExpect(jsonPath("$.passwordRequired").value(false))
                .andExpect(jsonPath("$.content").value("Top secret data"));

        // 4. Raw endpoint with X-Paste-Password header MUST SUCCEED (200)
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/raw")
                        .header("X-Paste-Password", "vault-pass-42"))
                .andExpect(status().isOk())
                .andExpect(content().string("Top secret data"));
    }

    @Test
    @DisplayName("SEC-06: Filenames with double quotes are rejected to prevent header injection")
    void testFilenameWithQuotesIsRejected() throws Exception {
        CreatePasteRequest badFilenameReq = new CreatePasteRequest(
                "Injection Attempt",
                List.of(new PasteFileRequest("evil\"name.txt", "Malicious payload", "plaintext")),
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER,
                null
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(badFilenameReq)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("quote characters")));
    }

    @Test
    @DisplayName("SEC-06: Content-Disposition header uses standard RFC encoding on download")
    void testContentDispositionEncoding() throws Exception {
        CreatePasteRequest safeReq = new CreatePasteRequest(
                "Download Test",
                List.of(new PasteFileRequest("safe-document.txt", "Hello Download", "plaintext")),
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER,
                null
        );
        CreatePasteResponse created = pasteService.createPaste(safeReq, null, "192.0.2.1");

        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/download"))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.CONTENT_DISPOSITION))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"safe-document.txt\""));
    }

    @Test
    @DisplayName("SEC-09: User registration rate limit rejects after 5 attempts per IP")
    void testRegistrationRateLimiting() throws Exception {
        String testIp = "198.51.100.99";

        for (int i = 1; i <= 5; i++) {
            RegisterRequest req = new RegisterRequest(
                    "ratelimituser" + i,
                    "ratelimit" + i + "@example.com",
                    "Password123!"
            );
            mockMvc.perform(post("/api/v1/auth/register")
                            .with(csrf())
                            .header("X-Real-IP", testIp)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(req)))
                    .andExpect(status().isCreated());
        }

        // 6th attempt from the same IP must be rejected by RateLimiterService
        RegisterRequest excessReq = new RegisterRequest(
                "excessuser",
                "excess@example.com",
                "Password123!"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .header("X-Real-IP", testIp)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(excessReq)))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    @DisplayName("SEC-04: Chunked batch deletion purges expired pastes across batches")
    void testChunkedBatchExpiration() {
        for (int i = 0; i < 15; i++) {
            Paste p = new Paste(
                    "batchExp" + i,
                    null,
                    "Batch Expired " + i,
                    "Content " + i,
                    "plaintext",
                    Visibility.PUBLIC,
                    10,
                    1,
                    null,
                    Instant.now().minusSeconds(3600)
            );
            pasteRepository.save(p);
        }

        int purged = expirationCleanupScheduler.executeCleanup();
        assertThat(purged).isGreaterThanOrEqualTo(15);
    }
}
