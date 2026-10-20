package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
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

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Public author profiles and developer discovery.
 *
 * Contract under test:
 *   GET /api/v1/discovery/authors/{username}
 *   GET /api/v1/discovery/authors/{username}/pastes?page=&size=
 *
 * Security-critical invariant: every author surface (summary counts, recent work, paginated
 * listing) must reuse PasteQueries.ELIGIBLE_PUBLIC_PREDICATE, so content hidden from public
 * discovery can never leak through a profile, a preview, or an aggregate.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthorProfileIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RateLimiterService rateLimiterService;
    @Autowired
    private JdbcTemplate jdbc;

    private String uid;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    // ------------------------------------------------------------------ helpers

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

    private String createPaste(MockHttpSession session, String title, String language,
                               Visibility visibility, ExpirationPolicy policy) throws Exception {
        return createPaste(session, title, "content for " + title, language, visibility, policy, null);
    }

    private String createPaste(MockHttpSession session, String title, String content, String language,
                               Visibility visibility, ExpirationPolicy policy, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreatePasteRequest(title, content, language, visibility, policy, password))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void addTag(MockHttpSession session, String pasteId, String tagName) throws Exception {
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags").with(csrf()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"" + tagName + "\"}"))
                .andExpect(status().isCreated());
    }

    private void star(MockHttpSession user, String pasteId) throws Exception {
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star").with(csrf()).session(user))
                .andExpect(status().isOk());
    }

    private void backdateCreatedAt(String pasteId, Instant createdAt) {
        jdbc.update("UPDATE pastes SET created_at = ? WHERE public_id = ?",
                Timestamp.from(createdAt), pasteId);
    }

    private void markEncrypted(String pasteId) {
        // chk_pastes_kdf_params requires complete KDF state when encryption_mode is set.
        jdbc.update("UPDATE pastes SET encryption_mode = 'LINK', kdf_salt = ?, kdf_iterations = ?, wrapped_key = ? WHERE public_id = ?",
                new byte[16], 100_000, new byte[60], pasteId);
    }

    private JsonNode getOkJson(String path) throws Exception {
        MvcResult result = mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode profileJson(String username) throws Exception {
        return getOkJson("/api/v1/discovery/authors/" + username);
    }

    private JsonNode pastesJson(String username, int page, int size) throws Exception {
        return getOkJson("/api/v1/discovery/authors/" + username + "/pastes?page=" + page + "&size=" + size);
    }

    private JsonNode assertProblem(MvcResult result, int expectedStatus, String expectedCode) throws Exception {
        assertEquals(expectedStatus, result.getResponse().getStatus());
        assertTrue(result.getResponse().getContentType() != null
                        && result.getResponse().getContentType().startsWith("application/problem+json"),
                "expected Problem Details content type, got " + result.getResponse().getContentType());
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertEquals(expectedCode, body.path("code").asText(),
                "unexpected problem code: " + body);
        return body;
    }

    private List<String> ids(JsonNode items) {
        List<String> out = new ArrayList<>();
        items.forEach(node -> out.add(node.get("id").asText()));
        return out;
    }

    /**
     * One eligible public paste plus every restricted shape the shared predicate must exclude.
     * Returns the id of the single eligible paste.
     */
    private String createEligiblePlusRestricted(MockHttpSession author, String marker) throws Exception {
        String eligible = createPaste(author, "Eligible " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        createPaste(author, "Private " + marker, "java", Visibility.PRIVATE, ExpirationPolicy.NEVER);
        createPaste(author, "Unlisted " + marker, "java", Visibility.UNLISTED, ExpirationPolicy.NEVER);
        createPaste(author, "Password " + marker, "content", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER, "vault-pass-1");

        String encrypted = createPaste(author, "Encrypted " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        markEncrypted(encrypted);

        createPaste(author, "Burn " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.BURN_AFTER_READING);

        String expired = createPaste(author, "Expired " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET expires_at = ? WHERE public_id = ?",
                Timestamp.from(Instant.now().minusSeconds(120)), expired);

        String hidden = createPaste(author, "Hidden " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", hidden);

        return eligible;
    }

    // ------------------------------------------------------------------ AP-01

    @Test
    void authorSummary_returnsOnlyApprovedPublicFields() throws Exception {
        String username = "ap01alice" + uid;
        String email = username + "@example.com";
        MockHttpSession alice = registerAndLogin(username);
        MockHttpSession bob = registerAndLogin("ap01bob" + uid);

        String paste = createPaste(alice, "AP01 public " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET views = 4 WHERE public_id = ?", paste);
        star(bob, paste);

        MvcResult result = mockMvc.perform(get("/api/v1/discovery/authors/" + username))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(username))
                .andExpect(jsonPath("$.joinedAt").exists())
                .andExpect(jsonPath("$.publicPasteCount").value(1))
                .andExpect(jsonPath("$.totalViews").value(4))
                .andExpect(jsonPath("$.totalSaves").value(1))
                .andExpect(jsonPath("$.recentPastes.length()").value(1))
                .andExpect(jsonPath("$.recentPastes[0].id").value(paste))
                // Sensitive account fields must never be serialized on a public surface.
                .andExpect(jsonPath("$.id").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.role").doesNotExist())
                .andExpect(jsonPath("$.emailVerified").doesNotExist())
                .andExpect(jsonPath("$.sessionVersion").doesNotExist())
                .andReturn();

        String raw = result.getResponse().getContentAsString();
        assertFalse(raw.contains(email), "public profile body must not contain the account email");
        assertFalse(raw.contains("passwordHash"), "public profile body must not contain password hashes");
        assertFalse(raw.contains("sessionVersion"), "public profile body must not expose session state");
        assertNotNull(result.getResponse().getContentAsString());
    }

    // ------------------------------------------------------------------ AP-02

    @Test
    void authorSummary_countsOnlyEligiblePublicPastes() throws Exception {
        String username = "ap02alice" + uid;
        MockHttpSession alice = registerAndLogin(username);

        String eligible = createEligiblePlusRestricted(alice, "ap02m" + uid);

        JsonNode profile = profileJson(username);
        assertEquals(1, profile.get("publicPasteCount").asLong(),
                "only the eligible public paste may be counted");
        assertEquals(0, profile.get("totalViews").asLong());
        assertEquals(0, profile.get("totalSaves").asLong());
        assertEquals(1, profile.get("recentPastes").size(),
                "restricted shapes must not appear in recent work");
        assertEquals(eligible, profile.get("recentPastes").get(0).get("id").asText());
    }

    // ------------------------------------------------------------------ AP-03

    @Test
    void authorSummary_recentWorkIsBoundedToThreeNewestEligible() throws Exception {
        String username = "ap03alice" + uid;
        MockHttpSession alice = registerAndLogin(username);

        Instant base = Instant.now().minusSeconds(3600);
        List<String> created = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            String id = createPaste(alice, "AP03 paste " + i + " " + uid, "java",
                    Visibility.PUBLIC, ExpirationPolicy.NEVER);
            backdateCreatedAt(id, base.plusSeconds(i * 60L));
            created.add(id);
        }

        JsonNode recent = profileJson(username).get("recentPastes");
        assertEquals(3, recent.size(), "recent work must be bounded to three items");
        assertEquals(List.of(created.get(4), created.get(3), created.get(2)), ids(recent),
                "recent work must be newest first");
    }

    // ------------------------------------------------------------------ AP-04

    @Test
    void authorSummary_unknownUsernameReturns404ProblemDetails() throws Exception {
        String username = "ap04nouser" + uid;

        MvcResult result = mockMvc.perform(get("/api/v1/discovery/authors/" + username))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.detail").value("Author not found."))
                .andReturn();

        assertNotNull(result.getResponse().getContentAsString());
    }

    // ------------------------------------------------------------------ AP-05

    @Test
    void authorSummary_malformedUsernameReturns400() throws Exception {
        for (String malformed : List.of("ab", "bad!name", "x".repeat(51))) {
            MvcResult result = mockMvc.perform(get("/api/v1/discovery/authors/" + malformed))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                    .andReturn();
            assertProblem(result, 400, "BAD_REQUEST");
        }
    }

    // ------------------------------------------------------------------ AP-06

    @Test
    void authorSummary_lookupIsCaseSensitive() throws Exception {
        String username = "ap06alice" + uid;
        registerAndLogin(username);

        // A different casing is a different lookup key; the database unique constraint is case-sensitive,
        // so a case-insensitive read could be ambiguous and must not be used.
        String differentlyCased = "Ap06alice" + uid;
        MvcResult result = mockMvc.perform(get("/api/v1/discovery/authors/" + differentlyCased))
                .andExpect(status().isNotFound())
                .andReturn();
        assertProblem(result, 404, "RESOURCE_NOT_FOUND");
    }

    // ------------------------------------------------------------------ AP-07

    @Test
    void authorEndpoints_areAnonymousAccessible() throws Exception {
        String username = "ap07alice" + uid;
        MockHttpSession alice = registerAndLogin(username);
        createPaste(alice, "AP07 public " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        // No session attached: public reads must behave exactly like public discovery.
        mockMvc.perform(get("/api/v1/discovery/authors/" + username))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes"))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ AP-08

    @Test
    void authorSummary_excludesOtherAuthorsContent() throws Exception {
        String username = "ap08alice" + uid;
        MockHttpSession alice = registerAndLogin(username);
        MockHttpSession bob = registerAndLogin("ap08bob" + uid);

        String aliceOne = createPaste(alice, "AP08 alice one " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String aliceTwo = createPaste(alice, "AP08 alice two " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        createPaste(bob, "AP08 bob secret " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        JsonNode profile = profileJson(username);
        assertEquals(2, profile.get("publicPasteCount").asLong());
        assertEquals(2, profile.get("recentPastes").size());

        JsonNode page = pastesJson(username, 0, 18);
        assertEquals(2, page.get("totalElements").asLong());
        // AP-08 is about exclusion, not ordering: when both inserts share a createdAt the
        // documented tie-break is publicId ascending, so creation order is not asserted here.
        // Newest-first ordering is covered deterministically by AP-06 (backdated timestamps).
        assertEquals(Set.of(aliceTwo, aliceOne), Set.copyOf(ids(page.get("items"))));
    }

    // ------------------------------------------------------------------ AP-09

    @Test
    void authorPastes_excludesRestrictedContent() throws Exception {
        String username = "ap09alice" + uid;
        MockHttpSession alice = registerAndLogin(username);

        String eligible = createEligiblePlusRestricted(alice, "ap09m" + uid);

        JsonNode page = pastesJson(username, 0, 18);
        assertEquals(1, page.get("totalElements").asLong(),
                "totalElements must equal the eligible count returned by the same predicate");
        assertEquals(1, page.get("items").size());
        assertEquals(eligible, page.get("items").get(0).get("id").asText());
        assertEquals(username, page.get("items").get(0).get("authorUsername").asText());
    }

    // ------------------------------------------------------------------ AP-10

    @Test
    void authorPastes_paginationIsDeterministicAcrossSharedTimestamps() throws Exception {
        String username = "ap10alice" + uid;
        MockHttpSession alice = registerAndLogin(username);

        Instant sameInstant = Instant.now().minusSeconds(600);
        List<String> created = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            String id = createPaste(alice, "AP10 paste " + i + " " + uid, "java",
                    Visibility.PUBLIC, ExpirationPolicy.NEVER);
            backdateCreatedAt(id, sameInstant);
            created.add(id);
        }
        List<String> expected = new ArrayList<>(created);
        expected.sort(String::compareTo); // publicId ASC is the tie-break

        JsonNode page0 = pastesJson(username, 0, 2);
        JsonNode page1 = pastesJson(username, 1, 2);
        JsonNode page2 = pastesJson(username, 2, 2);

        assertEquals(5, page0.get("totalElements").asLong());
        assertEquals(expected.subList(0, 2), ids(page0.get("items")));
        assertEquals(expected.subList(2, 4), ids(page1.get("items")));
        assertEquals(expected.subList(4, 5), ids(page2.get("items")));
        assertTrue(page0.get("isFirst").asBoolean());
        assertTrue(page2.get("isLast").asBoolean());

        List<String> union = new ArrayList<>();
        union.addAll(ids(page0.get("items")));
        union.addAll(ids(page1.get("items")));
        union.addAll(ids(page2.get("items")));
        assertEquals(5, union.size(), "pagination must not duplicate rows");
        assertEquals(expected, union, "pages must follow deterministic creation order");
    }

    // ------------------------------------------------------------------ AP-11

    @Test
    void authorPastes_clampsPageAndSize() throws Exception {
        String username = "ap11alice" + uid;
        MockHttpSession alice = registerAndLogin(username);
        createPaste(alice, "AP11 public " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes?size=999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(50));
        mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes?size=0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(1));
        mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes?page=-3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0));
    }

    // ------------------------------------------------------------------ AP-12

    @Test
    void authorPastes_unknownAuthorReturns404() throws Exception {
        String username = "ap12nouser" + uid;
        MvcResult result = mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes"))
                .andExpect(status().isNotFound())
                .andReturn();
        assertProblem(result, 404, "RESOURCE_NOT_FOUND");
    }

    // ------------------------------------------------------------------ AP-13

    @Test
    void deletedAuthor_isIndistinguishableFromMissing() throws Exception {
        String username = "ap13alice" + uid;
        String marker = "ap13m" + uid;
        MockHttpSession alice = registerAndLogin(username);
        String paste = createPaste(alice, "AP13 owned " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        Long aliceId = jdbc.queryForObject("SELECT id FROM users WHERE username = ?", Long.class, username);
        jdbc.update("DELETE FROM users WHERE id = ?", aliceId);

        MvcResult deletedProfile = mockMvc.perform(get("/api/v1/discovery/authors/" + username))
                .andExpect(status().isNotFound())
                .andReturn();
        MvcResult deletedPastes = mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes"))
                .andExpect(status().isNotFound())
                .andReturn();

        String missingUsername = "ap13missing" + uid;
        MvcResult missingProfile = mockMvc.perform(get("/api/v1/discovery/authors/" + missingUsername))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode deletedBody = assertProblem(deletedProfile, 404, "RESOURCE_NOT_FOUND");
        JsonNode missingBody = assertProblem(missingProfile, 404, "RESOURCE_NOT_FOUND");
        assertProblem(deletedPastes, 404, "RESOURCE_NOT_FOUND");
        assertEquals(missingBody.get("detail").asText(), deletedBody.get("detail").asText(),
                "a deleted author must be indistinguishable from a never-existing author");

        // The FK is ON DELETE SET NULL: the former paste stays public but loses attribution.
        JsonNode feed = getOkJson("/api/v1/discovery?q=" + marker + "&size=10");
        assertEquals(1, feed.get("items").size());
        assertEquals(paste, feed.get("items").get(0).get("id").asText());
        assertTrue(feed.get("items").get(0).get("authorUsername").isNull(),
                "ownerless legacy pastes must not be attributed to anyone");
    }

    // ------------------------------------------------------------------ AP-14

    @Test
    void ownerlessPastes_areNeverAttributedToAProfile() throws Exception {
        String username = "ap14alice" + uid;
        MockHttpSession alice = registerAndLogin(username);

        String owned = createPaste(alice, "AP14 owned " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String orphan = createPaste(alice, "AP14 orphan " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET user_id = NULL WHERE public_id = ?", orphan);

        JsonNode profile = profileJson(username);
        assertEquals(1, profile.get("publicPasteCount").asLong());

        JsonNode page = pastesJson(username, 0, 18);
        assertEquals(List.of(owned), ids(page.get("items")));
        assertFalse(ids(page.get("items")).contains(orphan));
    }

    // ------------------------------------------------------------------ AP-15

    @Test
    void hiddenPastes_doNotLeakThroughAggregates() throws Exception {
        String username = "ap15alice" + uid;
        MockHttpSession alice = registerAndLogin(username);
        MockHttpSession bob = registerAndLogin("ap15bob" + uid);
        MockHttpSession carol = registerAndLogin("ap15carol" + uid);

        String eligibleOne = createPaste(alice, "AP15 eligible one " + uid, "java",
                Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String eligibleTwo = createPaste(alice, "AP15 eligible two " + uid, "java",
                Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET views = 7 WHERE public_id = ?", eligibleOne);
        jdbc.update("UPDATE pastes SET views = 3 WHERE public_id = ?", eligibleTwo);
        star(bob, eligibleOne);

        String hidden = createPaste(alice, "AP15 hidden " + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        star(bob, hidden);
        star(carol, hidden);
        jdbc.update("UPDATE pastes SET views = 999, moderation_state = 'HIDDEN' WHERE public_id = ?", hidden);

        JsonNode profile = profileJson(username);
        assertEquals(2, profile.get("publicPasteCount").asLong());
        assertEquals(10, profile.get("totalViews").asLong(),
                "hidden paste views must not be included in aggregates");
        assertEquals(1, profile.get("totalSaves").asLong(),
                "hidden paste saves must not be included in aggregates");
    }

    // ------------------------------------------------------------------ AP-16

    @Test
    void discoveryFeed_stillAttributesRealAuthor() throws Exception {
        String username = "ap16alice" + uid;
        String marker = "ap16m" + uid;
        MockHttpSession alice = registerAndLogin(username);
        MockHttpSession bob = registerAndLogin("ap16bob" + uid);

        String paste = createPaste(alice, "AP16 attributed " + marker, "java",
                Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(alice, paste, "ap16tag" + uid);
        star(bob, paste);

        mockMvc.perform(get("/api/v1/discovery?q=" + marker + "&size=10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].authorUsername").value(username))
                .andExpect(jsonPath("$.items[0].tags", hasItem("ap16tag" + uid)))
                .andExpect(jsonPath("$.items[0].starsCount").value(1))
                .andExpect(jsonPath("$.items[0].id").value(paste));
    }

    // ------------------------------------------------------------------ AP-17

    @Test
    void discoveryCreate_rejectsClientSuppliedAuthorField() throws Exception {
        String username = "ap17alice" + uid;
        String marker = "ap17m" + uid;
        MockHttpSession alice = registerAndLogin(username);

        String spoofed = "{\"title\":\"Spoofed " + marker + "\",\"content\":\"c\",\"language\":\"java\","
                + "\"visibility\":\"PUBLIC\",\"expiration\":\"NEVER\",\"authorUsername\":\"mallory\"}";

        mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(spoofed))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        // Attribution still comes from the authenticated principal, never from the request payload.
        createPaste(alice, "Legit " + marker, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        JsonNode feed = getOkJson("/api/v1/discovery?q=" + marker + "&size=10");
        for (JsonNode item : feed.get("items")) {
            assertEquals(username, item.get("authorUsername").asText(),
                    "server must ignore any client-supplied author identity");
        }
    }

    // ------------------------------------------------------------------ AP-18

    @Test
    void discoveryAttribution_survivesLogoutAndEdit() throws Exception {
        String username = "ap18alice" + uid;
        String marker = "ap18m" + uid;
        MockHttpSession alice = registerAndLogin(username);
        String paste = createPaste(alice, "AP18 original " + marker, "java",
                Visibility.PUBLIC, ExpirationPolicy.NEVER);

        assertEquals(username, getOkJson("/api/v1/discovery?q=" + marker).get("items").get(0)
                .get("authorUsername").asText());

        Long version = jdbc.queryForObject("SELECT version FROM pastes WHERE public_id = ?", Long.class, paste);
        mockMvc.perform(put("/api/v1/account/pastes/" + paste).with(csrf()).session(alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new EditPasteRequest(
                                "AP18 edited " + marker, "updated content", "java", Visibility.PUBLIC, version))))
                .andExpect(status().isOk());

        JsonNode afterEdit = getOkJson("/api/v1/discovery?q=" + marker);
        assertEquals(username, afterEdit.get("items").get(0).get("authorUsername").asText(),
                "editing a paste must preserve its author");

        mockMvc.perform(post("/api/v1/auth/logout").with(csrf()).session(alice))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/discovery?q=" + marker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].authorUsername").value(username))
                .andExpect(jsonPath("$.items[*].authorUsername", not(hasItem("mallory"))));
    }
}
