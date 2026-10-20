package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.application.PasteService;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteFile;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Authorization parity across every content surface. Raw, individual file, download, ZIP,
 * and embed must apply the same visibility, token, password, moderation, expiry, and
 * consumption rules as the page view.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContentAuthorizationParityIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private PasteRepository pasteRepository;
    @Autowired
    private PasteService pasteService;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private RateLimiterService rateLimiterService;

    private String uid;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    private MockHttpSession registerAndLogin(String username) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RegisterRequest(username, username + "@example.com", PASSWORD))))
                .andExpect(status().isCreated());
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) login.getRequest().getSession();
    }

    private CreatePasteResponse createMulti(Visibility visibility, ExpirationPolicy expiration,
                                            String password, MockHttpSession session) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Parity " + uid,
                null,
                null,
                visibility,
                expiration,
                password,
                List.of(
                        new PasteFileRequest("main.txt", "primary-content", "plaintext"),
                        new PasteFileRequest("secondary.txt", "secondary-content", "plaintext")));
        var builder = post("/api/v1/pastes").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request));
        if (session != null) {
            builder.session(session);
        }
        MvcResult result = mockMvc.perform(builder)
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), CreatePasteResponse.class);
    }

    private String createExpiredMulti() {
        String id = "parity-expired-" + uid;
        Paste paste = new Paste(
                id, null, "Expired parity", "expired content", "plaintext", Visibility.PUBLIC,
                16, 1, null, Instant.now().minusSeconds(60));
        paste.addFile(new PasteFile(paste, "main.txt", "expired-primary", "plaintext", 0));
        paste.addFile(new PasteFile(paste, "secondary.txt", "expired-secondary", "plaintext", 1));
        pasteRepository.save(paste);
        return id;
    }

    private List<String> contentPaths(String id) {
        return List.of(
                "/api/v1/pastes/" + id,
                "/api/v1/pastes/" + id + "/raw",
                "/api/v1/pastes/" + id + "/download",
                "/api/v1/pastes/" + id + "/download-zip",
                "/api/v1/pastes/" + id + "/files/main.txt/raw",
                "/api/v1/pastes/" + id + "/files/main.txt/download");
    }

    private void expectContentStatuses(String id, String token, int expectedStatus) throws Exception {
        for (String path : contentPaths(id)) {
            var builder = get(path);
            if (token != null) {
                builder.header("X-Share-Token", token);
            }
            MvcResult result = mockMvc.perform(builder).andReturn();
            assertEquals(expectedStatus, result.getResponse().getStatus(),
                    path + " must return " + expectedStatus);
        }
    }

    @Test
    @DisplayName("PARITY-01: PRIVATE paste denies every content surface to anonymous callers")
    void privatePaste_deniedAcrossContentSurfaces() throws Exception {
        MockHttpSession owner = registerAndLogin("paritypriv" + uid);
        CreatePasteResponse paste = createMulti(
                Visibility.PRIVATE, ExpirationPolicy.NEVER, null, owner);

        expectContentStatuses(paste.id(), null, 404);
        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/embed"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("PARITY-02: revoked unlisted link denies every content surface with the stale token")
    void revokedUnlistedPaste_deniedAcrossContentSurfaces() throws Exception {
        CreatePasteResponse paste = createMulti(
                Visibility.UNLISTED, ExpirationPolicy.NEVER, null, null);
        assertThat(paste.shareToken()).isNotBlank();

        mockMvc.perform(post("/api/v1/pastes/" + paste.id() + "/revoke-link")
                        .with(csrf())
                        .header("X-Deletion-Capability", paste.deletionCapability()))
                .andExpect(status().isNoContent());

        expectContentStatuses(paste.id(), paste.shareToken(), 404);
        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/embed"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("PARITY-03: moderation-hidden paste is a 404 on every content surface")
    void hiddenPaste_deniedAcrossContentSurfaces() throws Exception {
        CreatePasteResponse paste = createMulti(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, null, null);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", paste.id());

        expectContentStatuses(paste.id(), null, 404);
        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/embed"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("PARITY-04: expired paste is a 404 on every content surface")
    void expiredPaste_deniedAcrossContentSurfaces() throws Exception {
        String id = createExpiredMulti();

        expectContentStatuses(id, null, 404);
        mockMvc.perform(get("/api/v1/pastes/" + id + "/embed"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("PARITY-05: deleted paste is a 404 on every content surface")
    void deletedPaste_deniedAcrossContentSurfaces() throws Exception {
        CreatePasteResponse paste = createMulti(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, null, null);

        mockMvc.perform(post("/api/v1/pastes/" + paste.id() + "/delete-anonymous")
                        .with(csrf())
                        .header("X-Deletion-Capability", paste.deletionCapability()))
                .andExpect(status().isNoContent());

        expectContentStatuses(paste.id(), null, 404);
        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/embed"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("PARITY-06: password gate is identical on page, raw, file, download, ZIP, and embed")
    void passwordProtectedPaste_requiresPasswordOnEverySurface() throws Exception {
        CreatePasteResponse paste = createMulti(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, "Pass1234!", null);

        // The HTML/page view intentionally returns a masked 200 challenge; every raw/download
        // surface must return the same 401 as the page's password verifier.
        mockMvc.perform(get("/api/v1/pastes/" + paste.id()))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                        .contains("\"passwordRequired\":true"));

        for (String path : List.of(
                "/api/v1/pastes/" + paste.id() + "/raw",
                "/api/v1/pastes/" + paste.id() + "/download",
                "/api/v1/pastes/" + paste.id() + "/download-zip",
                "/api/v1/pastes/" + paste.id() + "/files/main.txt/raw",
                "/api/v1/pastes/" + paste.id() + "/files/main.txt/download")) {
            mockMvc.perform(get(path))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/raw")
                        .header("X-Paste-Password", "wrong-password"))
                .andExpect(status().isUnauthorized());

        // Keep the successful-unlock assertions independent of the online brute-force budget:
        // that budget is asserted by the dedicated password/rate-limit suites.
        rateLimiterService.clear();

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/raw")
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/files/main.txt/raw")
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/files/main.txt/download")
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/download")
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/download-zip")
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isOk());

        // Embed must never accept a password and must never expose a challenge bypass.
        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/embed")
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("PARITY-07: concurrent content requests consume a view-once paste exactly once")
    void viewOnceConcurrentContentRequests_consumeExactlyOnce() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Concurrent view once " + uid,
                null,
                null,
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE,
                null,
                List.of(new PasteFileRequest("main.txt", "view-once-body", "plaintext")));
        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");
        String id = created.id();

        List<String> paths = List.of(
                "/api/v1/pastes/" + id,
                "/api/v1/pastes/" + id,
                "/api/v1/pastes/" + id + "/raw",
                "/api/v1/pastes/" + id + "/raw",
                "/api/v1/pastes/" + id + "/files/main.txt/raw",
                "/api/v1/pastes/" + id + "/files/main.txt/raw");
        ExecutorService executor = Executors.newFixedThreadPool(paths.size());
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (String path : paths) {
                futures.add(executor.submit(() -> {
                    start.await(5, TimeUnit.SECONDS);
                    try {
                        return mockMvc.perform(get(path)).andReturn().getResponse().getStatus();
                    } catch (Exception e) {
                        return -1;
                    }
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) {
                statuses.add(future.get(30, TimeUnit.SECONDS));
            }
            Collections.sort(statuses);
            assertEquals(List.of(200, 404, 404, 404, 404, 404), statuses,
                    "exactly one concurrent content request may consume the view-once paste");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("PARITY-08: a nonexistent file lookup does not consume a view-once paste")
    void viewOnceInvalidFileLookup_doesNotConsumePaste() throws Exception {
        CreatePasteResponse paste = createMulti(
                Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE, null, null);

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/files/not-present.txt/raw"))
                .andExpect(status().isNotFound());

        assertThat(pasteRepository.findActiveByPublicId(paste.id(), Instant.now()))
                .as("invalid file lookup must not burn the paste")
                .isPresent();

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/files/main.txt/raw"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("PARITY-09: view-once embed is read-only and does not consume the paste")
    void viewOnceEmbed_doesNotConsumePaste() throws Exception {
        CreatePasteResponse paste = createMulti(
                Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE, null, null);

        mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/embed"))
                .andExpect(status().isForbidden());

        assertThat(pasteRepository.findActiveByPublicId(paste.id(), Instant.now())).isPresent();

        JsonNode view = objectMapper.readTree(mockMvc.perform(get("/api/v1/pastes/" + paste.id()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(view.path("viewOnce").asBoolean()).isTrue();
    }
}
