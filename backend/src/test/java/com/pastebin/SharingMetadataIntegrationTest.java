package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.EncryptedFilePayload;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Social-crawler metadata contract for the canonical paste URL.
 *
 * <p>The metadata HTML is served by the backend at {@code GET /p/{id}}. Every ineligible
 * or unknown paste receives the same 404 Problem Details response, so crawlers cannot use
 * the shell as an existence oracle. The SPA remains the fallback for client-side routes.</p>
 */
@SpringBootTest(properties = "pastebin.share.public-base-url=https://share.extra.example")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SharingMetadataIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";
    private static final Pattern MAX_AGE = Pattern.compile("max-age=(\\d+)");

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private PasteRepository pasteRepository;
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
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) loginResult.getRequest().getSession();
    }

    private CreatePasteResponse createPaste(String title, String content, Visibility visibility,
                                            ExpirationPolicy expiration, String password,
                                            MockHttpSession session) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                title, content, "plaintext", visibility, expiration, password);
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

    private CreatePasteResponse createPublic(String title, String content) throws Exception {
        return createPaste(title, content, Visibility.PUBLIC, ExpirationPolicy.NEVER, null, null);
    }

    private String createEncryptedPaste() throws Exception {
        byte[] ciphertext = "{not-plaintext}".getBytes(StandardCharsets.UTF_8);
        EncryptedFilePayload file = new EncryptedFilePayload(
                "secret.bin",
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12},
                ciphertext,
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16});
        byte[] wrappedKey = new byte[60];
        for (int i = 0; i < wrappedKey.length; i++) {
            wrappedKey[i] = (byte) (i + 1);
        }
        CreateEncryptedPasteRequest request = new CreateEncryptedPasteRequest(
                List.of(file),
                "LINK",
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16},
                600000,
                wrappedKey,
                null,
                Visibility.PUBLIC,
                "plaintext",
                false,
                null);
        MvcResult result = mockMvc.perform(post("/api/v1/pastes/encrypted").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private String createExpiredPaste() {
        String id = "meta-exp-" + uid;
        Paste paste = new Paste(
                id, null, "Expired metadata", "expired secret", "plaintext", Visibility.PUBLIC,
                14, 1, null, Instant.now().minusSeconds(60));
        paste.addFile(new PasteFile(paste, "expired.txt", "expired secret", "plaintext", 0));
        pasteRepository.save(paste);
        return id;
    }

    private MvcResult fetchMetadata(String path) throws Exception {
        return mockMvc.perform(get(path)).andReturn();
    }

    private static final class ProblemView {
        private final int status;
        private final String contentType;
        private final String cacheControl;
        private final String robots;
        private final String vary;
        private final JsonNode body;

        private ProblemView(MvcResult result, ObjectMapper mapper) throws Exception {
            this.status = result.getResponse().getStatus();
            this.contentType = result.getResponse().getContentType();
            this.cacheControl = result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL);
            this.robots = result.getResponse().getHeader("X-Robots-Tag");
            this.vary = result.getResponse().getHeader(HttpHeaders.VARY);
            this.body = mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        }
    }

    private static String headerOrEmpty(String value) {
        return value == null ? "" : value;
    }

    @Test
    @DisplayName("META-01: eligible PUBLIC paste renders escaped Open Graph HTML at the canonical URL")
    void eligiblePublicPaste_rendersSafeOpenGraphHtml() throws Exception {
        CreatePasteResponse created = createPublic(
                "<script>alert('x')</script> & \"quoted\"",
                "TOP_SECRET_CONTENT_MARKER");
        String id = created.id();

        MvcResult result = mockMvc.perform(get("/p/" + id)
                        .header(HttpHeaders.HOST, "evil.example")
                        .header("X-Forwarded-Host", "evil.example"))
                .andExpect(status().isOk())
                .andReturn();

        String html = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(result.getResponse().getContentType()).contains("text/html");
        assertThat(result.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headerOrEmpty(result.getResponse().getHeader("X-Robots-Tag"))).containsIgnoringCase("noindex");
        assertThat(headerOrEmpty(result.getResponse().getHeader("Referrer-Policy")))
                .containsIgnoringCase("no-referrer");

        String canonical = "https://share.extra.example/p/" + id;
        assertThat(html).contains("rel=\"canonical\"");
        assertThat(html).contains("href=\"" + canonical + "\"");
        assertThat(html).contains("property=\"og:url\"");
        assertThat(html).contains("content=\"" + canonical + "\"");
        assertThat(html).contains("property=\"og:title\"");
        assertThat(html).contains("property=\"og:description\"");
        assertThat(html).contains("name=\"twitter:card\"");
        assertThat(html).contains("/assets/app.js");
        assertThat(html).contains("/assets/app.css");
        assertThat(html).contains("id=\"root\"");

        assertThat(html).contains("&lt;script&gt;");
        assertThat(html).contains("&lt;/script&gt;");
        assertThat(html).doesNotContain("<script>alert('x')</script>");
        assertThat(html).doesNotContain("TOP_SECRET_CONTENT_MARKER");
        assertThat(html).doesNotContain("evil.example");
    }

    @Test
    @DisplayName("META-02: public metadata cache lifetime never outlives the paste")
    void publicMetadataCacheLifetime_isBoundedByRemainingLifetime() throws Exception {
        String id = "meta-ttl-" + uid;
        Instant expiresAt = Instant.now().plusSeconds(20);
        Paste paste = new Paste(
                id, null, "Short lived", "short lived content", "plaintext", Visibility.PUBLIC,
                19, 1, null, expiresAt);
        pasteRepository.save(paste);

        MvcResult result = fetchMetadata("/p/" + id);
        assertEquals(200, result.getResponse().getStatus());
        String cacheControl = headerOrEmpty(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL));
        assertThat(cacheControl).containsIgnoringCase("public");
        assertThat(cacheControl).containsIgnoringCase("must-revalidate");
        assertThat(cacheControl).containsIgnoringCase("max-age=");

        Matcher matcher = MAX_AGE.matcher(cacheControl);
        assertTrue(matcher.find(), "Cache-Control must carry an explicit max-age: " + cacheControl);
        int maxAge = Integer.parseInt(matcher.group(1));
        long remainingSeconds = Math.max(0, Duration.between(Instant.now(), expiresAt).toSeconds());
        assertThat(maxAge).isBetween(0, 20);
        assertThat((long) maxAge).isLessThanOrEqualTo(remainingSeconds + 1);

        MvcResult expiredResult = fetchMetadata("/p/meta-expired-" + uid);
        assertEquals(404, expiredResult.getResponse().getStatus());
        assertThat(headerOrEmpty(expiredResult.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)))
                .containsIgnoringCase("no-store");

        // A cacheable public response must never be cached by intermediary caches for the
        // remainder of the paste's life, even if the paste expires between requests.
        long expiryAfterResponse = Math.max(0, Duration.between(Instant.now(), expiresAt).toSeconds());
        assertThat((long) maxAge).isLessThanOrEqualTo(expiryAfterResponse + 1);
    }

    @Test
    @DisplayName("META-03: every ineligible state is an indistinguishable 404 Problem Details")
    void ineligibleStates_returnIndistinguishable404() throws Exception {
        Map<String, String> secrets = new LinkedHashMap<>();

        String missingId = "missing-meta-" + uid;
        secrets.put("missing", "missing-content-" + uid);

        String expiredId = createExpiredPaste();
        secrets.put("expired", "expired secret");

        CreatePasteResponse password = createPaste(
                "Password metadata " + uid, "password-secret-" + uid,
                Visibility.PUBLIC, ExpirationPolicy.NEVER, "Pass1234!", null);
        secrets.put("password", "password-secret-" + uid);

        CreatePasteResponse unlisted = createPaste(
                "Unlisted metadata " + uid, "unlisted-secret-" + uid,
                Visibility.UNLISTED, ExpirationPolicy.NEVER, null, null);
        assertNotNull(unlisted.shareToken());
        secrets.put("unlisted", "unlisted-secret-" + uid);

        MockHttpSession owner = registerAndLogin("meta" + uid);
        CreatePasteResponse privatePaste = createPaste(
                "Private metadata " + uid, "private-secret-" + uid,
                Visibility.PRIVATE, ExpirationPolicy.NEVER, null, owner);
        secrets.put("private", "private-secret-" + uid);

        CreatePasteResponse hidden = createPublic("Hidden metadata " + uid, "hidden-secret-" + uid);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", hidden.id());
        secrets.put("hidden", "hidden-secret-" + uid);

        CreatePasteResponse viewOnce = createPaste(
                "View once metadata " + uid, "view-once-secret-" + uid,
                Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE, null, null);
        secrets.put("viewOnce", "view-once-secret-" + uid);

        String encryptedId = createEncryptedPaste();
        secrets.put("encrypted", "{not-plaintext}");

        Map<String, String> paths = new LinkedHashMap<>();
        paths.put("missing", "/p/" + missingId);
        paths.put("expired", "/p/" + expiredId);
        paths.put("password", "/p/" + password.id());
        paths.put("unlisted", "/p/" + unlisted.id());
        paths.put("private", "/p/" + privatePaste.id());
        paths.put("hidden", "/p/" + hidden.id());
        paths.put("viewOnce", "/p/" + viewOnce.id());
        paths.put("encrypted", "/p/" + encryptedId);

        Map<String, ProblemView> observations = new LinkedHashMap<>();
        Map<String, String> canonicalProblemFields = new LinkedHashMap<>();

        for (Map.Entry<String, String> entry : paths.entrySet()) {
            ProblemView view = new ProblemView(fetchMetadata(entry.getValue()), objectMapper);
            observations.put(entry.getKey(), view);

            assertEquals(404, view.status, entry.getKey() + " must be unavailable to crawlers");
            assertThat(headerOrEmpty(view.contentType)).startsWith("application/problem+json");
            assertThat(headerOrEmpty(view.cacheControl)).containsIgnoringCase("no-store");
            assertThat(headerOrEmpty(view.robots)).containsIgnoringCase("noindex");
            assertThat(headerOrEmpty(view.vary)).contains("X-Share-Token");
            assertThat(headerOrEmpty(view.vary)).contains("X-Paste-Password");
            assertThat(headerOrEmpty(view.vary)).containsIgnoringCase("Cookie");

            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("type", view.body.path("type").asText());
            fields.put("title", view.body.path("title").asText());
            fields.put("status", view.body.path("status").asText());
            fields.put("code", view.body.path("code").asText());
            fields.put("detail", view.body.path("detail").asText());
            canonicalProblemFields.put(entry.getKey(), fields.toString());
        }

        Set<String> distinctProblems = new LinkedHashSet<>(canonicalProblemFields.values());
        assertEquals(1, distinctProblems.size(),
                "all ineligible metadata states must expose the same Problem Details contract: "
                        + canonicalProblemFields);

        // Supplying the correct password must not turn metadata into an OG-bearing response.
        MvcResult unlockedPassword = mockMvc.perform(get("/p/" + password.id())
                        .header("X-Paste-Password", "Pass1234!"))
                .andReturn();
        assertEquals(404, unlockedPassword.getResponse().getStatus());
        assertThat(unlockedPassword.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("password-secret-" + uid);

        ProblemView first = observations.values().iterator().next();
        assertEquals(404, first.body.path("status").asInt());
        assertEquals("RESOURCE_NOT_FOUND", first.body.path("code").asText());
        assertEquals("Paste not found or has expired.", first.body.path("detail").asText());

        for (Map.Entry<String, String> entry : secrets.entrySet()) {
            ProblemView view = observations.get(entry.getKey());
            String serialized = view.body.toString();
            assertThat(serialized).doesNotContain(entry.getValue());
            assertThat(serialized).doesNotContain(unlisted.shareToken());
        }
    }

    @Test
    @DisplayName("META-04: unlisted tokens cannot opt a hidden paste into metadata")
    void unlistedTokenQueryAndHeader_cannotMakeIneligiblePasteEligible() throws Exception {
        CreatePasteResponse unlisted = createPaste(
                "Token metadata " + uid, "token-secret-" + uid,
                Visibility.UNLISTED, ExpirationPolicy.NEVER, null, null);

        MvcResult queryToken = fetchMetadata("/p/" + unlisted.id() + "?token=" + unlisted.shareToken());
        MvcResult headerToken = mockMvc.perform(get("/p/" + unlisted.id())
                        .header("X-Share-Token", unlisted.shareToken()))
                .andReturn();

        assertEquals(404, queryToken.getResponse().getStatus());
        assertEquals(404, headerToken.getResponse().getStatus());
        assertThat(queryToken.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(unlisted.shareToken());
        assertThat(headerToken.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(unlisted.shareToken());
    }

    @Test
    @DisplayName("META-05: view-once metadata lookup does not consume the paste")
    void viewOnceMetadataLookup_doesNotConsumePaste() throws Exception {
        CreatePasteResponse viewOnce = createPaste(
                "Metadata burn " + uid, "burn-secret-" + uid,
                Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE, null, null);

        assertEquals(404, fetchMetadata("/p/" + viewOnce.id()).getResponse().getStatus());
        assertThat(pasteRepository.findActiveByPublicId(viewOnce.id(), Instant.now())).isPresent();

        mockMvc.perform(get("/api/v1/pastes/" + viewOnce.id()))
                .andExpect(status().isOk());
    }
}
