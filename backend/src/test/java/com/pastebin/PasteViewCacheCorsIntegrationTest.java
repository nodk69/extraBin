package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cache and CORS contract for the paste view surface. User-specific fields (owner flag,
 * votes, stars, password challenge state) mean the JSON response can never be shared by a
 * proxy, while error responses must not be cached at all.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasteViewCacheCorsIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";
    private static final String ORIGIN = "http://localhost:5173";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private PasteRepository pasteRepository;
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

    private CreatePasteResponse createPaste(Visibility visibility, ExpirationPolicy expiration,
                                            String password, MockHttpSession session) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Cache test " + uid,
                null,
                null,
                visibility,
                expiration,
                password,
                List.of(new com.pastebin.paste.api.dto.PasteFileRequest(
                        "main.txt", "cache body " + uid, "plaintext")));
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

    private String header(MvcResult result, String name) {
        List<String> values = result.getResponse().getHeaderValues(name).stream()
                .map(Object::toString)
                .toList();
        return String.join(", ", values);
    }

    private MvcResult view(CreatePasteResponse paste, MockHttpSession session, String token) throws Exception {
        var builder = get("/api/v1/pastes/" + paste.id())
                .header("X-Skip-View-Count", "true");
        if (session != null) {
            builder.session(session);
        }
        if (token != null) {
            builder.header("X-Share-Token", token);
        }
        return mockMvc.perform(builder).andReturn();
    }

    @Test
    @DisplayName("CACHE-01: anonymous public view is private, revalidated, and varies on access headers")
    void anonymousPublicView_isPrivateNoCache_andVaries() throws Exception {
        CreatePasteResponse paste = createPaste(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, null, null);

        MvcResult result = view(paste, null, null);
        assertEquals(200, result.getResponse().getStatus());
        String cacheControl = header(result, HttpHeaders.CACHE_CONTROL).toLowerCase(Locale.ROOT);
        assertThat(cacheControl).contains("private");
        assertThat(cacheControl).contains("no-cache");
        assertThat(cacheControl).doesNotContain("no-store");

        String vary = header(result, HttpHeaders.VARY);
        assertThat(vary).contains("X-Share-Token");
        assertThat(vary).contains("X-Paste-Password");
        assertThat(vary).containsIgnoringCase("Cookie");
    }

    @Test
    @DisplayName("CACHE-02: authenticated, unlisted, password, and view-once views are never stored")
    void sensitiveViews_areNoStore() throws Exception {
        MockHttpSession session = registerAndLogin("cache" + uid);
        CreatePasteResponse authenticatedView = createPaste(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, null, null);
        MvcResult authenticatedResult = view(authenticatedView, session, null);
        assertEquals(200, authenticatedResult.getResponse().getStatus());
        assertThat(header(authenticatedResult, HttpHeaders.CACHE_CONTROL))
                .containsIgnoringCase("no-store");

        CreatePasteResponse unlisted = createPaste(
                Visibility.UNLISTED, ExpirationPolicy.NEVER, null, null);
        MvcResult unlistedResult = view(unlisted, null, unlisted.shareToken());
        assertEquals(200, unlistedResult.getResponse().getStatus());
        assertThat(header(unlistedResult, HttpHeaders.CACHE_CONTROL))
                .containsIgnoringCase("no-store");

        CreatePasteResponse locked = createPaste(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, "Pass1234!", null);
        MvcResult lockedResult = view(locked, null, null);
        assertEquals(200, lockedResult.getResponse().getStatus());
        assertThat(lockedResult.getResponse().getContentAsString()).contains("\"passwordRequired\":true");
        assertThat(header(lockedResult, HttpHeaders.CACHE_CONTROL))
                .containsIgnoringCase("no-store");

        CreatePasteResponse viewOnce = createPaste(
                Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE, null, null);
        MvcResult first = view(viewOnce, null, null);
        assertEquals(200, first.getResponse().getStatus());
        assertThat(header(first, HttpHeaders.CACHE_CONTROL)).containsIgnoringCase("no-store");
        MvcResult second = view(viewOnce, null, null);
        assertEquals(404, second.getResponse().getStatus());
        assertThat(header(second, HttpHeaders.CACHE_CONTROL)).containsIgnoringCase("no-store");
    }

    @Test
    @DisplayName("CACHE-03: 404 responses are no-store and preserve the access Vary contract")
    void notFoundResponses_areNoStoreAndVarried() throws Exception {
        String id = "cache-expired-" + uid;
        Paste paste = new Paste(
                id, null, "Expired cache", "expired body", "plaintext", Visibility.PUBLIC,
                12, 1, null, Instant.now().minusSeconds(60));
        paste.addFile(new PasteFile(paste, "expired.txt", "expired body", "plaintext", 0));
        pasteRepository.save(paste);

        for (String path : List.of("/api/v1/pastes/" + id, "/api/v1/pastes/missing-" + uid)) {
            MvcResult result = mockMvc.perform(get(path)
                            .header(HttpHeaders.ORIGIN, ORIGIN))
                    .andExpect(status().isNotFound())
                    .andReturn();
            String cacheControl = header(result, HttpHeaders.CACHE_CONTROL).toLowerCase(Locale.ROOT);
            assertThat(cacheControl).contains("no-store");
            String vary = header(result, HttpHeaders.VARY);
            assertThat(vary).contains("X-Share-Token");
            assertThat(vary).contains("X-Paste-Password");
            assertThat(vary).containsIgnoringCase("Cookie");
            assertThat(vary).containsIgnoringCase("Origin");
        }
    }

    @Test
    @DisplayName("CORS-01: preflight allows share token and password headers and exposes download filenames")
    void preflight_allowsShareTokenAndExposesDownloadFileName() throws Exception {
        MvcResult result = mockMvc.perform(options("/api/v1/pastes/anything/download")
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "X-Share-Token, X-Paste-Password"))
                .andExpect(status().isOk())
                .andReturn();

        String allowOrigin = header(result, HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
        assertThat(allowOrigin).isEqualTo(ORIGIN);

        String allowHeaders = header(result, HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS)
                .toLowerCase(Locale.ROOT);
        assertThat(allowHeaders).contains("x-share-token");
        assertThat(allowHeaders).contains("x-paste-password");

        String exposeHeaders = header(result, HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS)
                .toLowerCase(Locale.ROOT);
        assertThat(exposeHeaders).contains("content-disposition");
        assertThat(exposeHeaders).contains("retry-after");
    }

    @Test
    @DisplayName("CACHE-04: raw, individual file, download, ZIP, and embed surfaces are always no-store")
    void contentSurfaces_areAlwaysNoStore() throws Exception {
        CreatePasteResponse paste = createPaste(
                Visibility.PUBLIC, ExpirationPolicy.NEVER, null, null);

        List<String> paths = List.of(
                "/api/v1/pastes/" + paste.id() + "/raw",
                "/api/v1/pastes/" + paste.id() + "/files/main.txt/raw",
                "/api/v1/pastes/" + paste.id() + "/download",
                "/api/v1/pastes/" + paste.id() + "/files/main.txt/download",
                "/api/v1/pastes/" + paste.id() + "/download-zip",
                "/api/v1/pastes/" + paste.id() + "/embed");

        for (String path : paths) {
            MvcResult result = mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andReturn();
            assertThat(header(result, HttpHeaders.CACHE_CONTROL))
                    .as("Cache-Control for " + path)
                    .containsIgnoringCase("no-store");
        }
    }
}
