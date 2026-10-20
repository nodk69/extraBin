package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
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
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * DISC-01..DISC-15: Discovery feed search, filters, author attribution, rate limiting.
 * Contract: Discovery Increment 1, Revision 2 (P0-1 shared eligibility, P1-6 bounded search).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DiscoverySearchIntegrationTest {

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

    private MockHttpSession registerAndLogin(String username) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(username, username + "@example.com", PASSWORD))))
                .andExpect(status().isCreated());
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) loginResult.getRequest().getSession();
    }

    private String createPaste(MockHttpSession session, String title, String content,
                               String language, Visibility visibility, ExpirationPolicy policy) throws Exception {
        return createPaste(session, title, content, language, visibility, policy, null);
    }

    private String createPaste(MockHttpSession session, String title, String content,
                               String language, Visibility visibility, ExpirationPolicy policy, String password) throws Exception {
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

    private void backdateCreatedAt(String pasteId, Instant createdAt) {
        jdbc.update("UPDATE pastes SET created_at = ? WHERE public_id = ?", Timestamp.from(createdAt), pasteId);
    }

    private void markEncrypted(String pasteId) {
        // chk_pastes_kdf_params requires complete KDF state when encryption_mode is set
        byte[] salt = new byte[16];
        byte[] wrappedKey = new byte[60];
        jdbc.update("UPDATE pastes SET encryption_mode = 'LINK', kdf_salt = ?, kdf_iterations = ?, wrapped_key = ? WHERE public_id = ?",
                salt, 100_000, wrappedKey, pasteId);
    }

    private List<String> feedIds(String query) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery" + (query == null ? "" : "?" + query)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        List<String> ids = new ArrayList<>();
        items.forEach(n -> ids.add(n.get("id").asText()));
        return ids;
    }

    // Fixture note: MockMvc (spring-test 6.1) treats the URI template as unencoded and does NOT
    // decode query parameters (q=100%25 arrives as the literal string "100%25"). A real client's
    // literal "%" query reaches the server as the decoded parameter value, so wildcard-escaping
    // cases must be supplied via request parameters to test the server-side contract.
    private List<String> feedIdsWithParam(String q) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery").param("q", q))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        List<String> ids = new ArrayList<>();
        items.forEach(n -> ids.add(n.get("id").asText()));
        return ids;
    }

    // DISC-01: anonymous feed returns eligible public pastes only (positive case)
    @Test
    void DISC_01_anonymousFeed_returnsEligiblePublicPastes() throws Exception {
        MockHttpSession owner = registerAndLogin("disc01" + uid);
        String marker = "disc01m" + uid;
        String a = createPaste(owner, "Alpha " + marker, "content alpha", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String b = createPaste(owner, "Beta " + marker, "content beta", "python", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        List<String> ids = feedIds("q=" + marker);
        assertTrue(ids.contains(a) && ids.contains(b), "eligible public pastes must appear in feed");
    }

    // DISC-02: private, unlisted, password, burn, encrypted, expired are all excluded
    @Test
    void DISC_02_feed_excludesAllIneligibleCategories() throws Exception {
        MockHttpSession owner = registerAndLogin("disc02" + uid);
        String marker = "disc02m" + uid;

        String expired = createPaste(owner, "Expired " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY);
        jdbc.update("UPDATE pastes SET expires_at = ? WHERE public_id = ?", Timestamp.from(Instant.now().minusSeconds(60)), expired);

        String burn = createPaste(owner, "Burn " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.BURN_AFTER_READING);
        String password = createPaste(owner, "Pwd " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER,
                "some-password");
        String encrypted = createPaste(owner, "Enc " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        markEncrypted(encrypted);
        createPaste(owner, "Private " + marker, "c", "java", Visibility.PRIVATE, ExpirationPolicy.NEVER);
        createPaste(owner, "Unlisted " + marker, "c", "java", Visibility.UNLISTED, ExpirationPolicy.NEVER);

        List<String> ids = feedIds("q=" + marker);
        for (String ineligible : List.of(expired, burn, password, encrypted)) {
            assertTrue(!ids.contains(ineligible), "ineligible paste must be excluded: " + ineligible);
        }
    }

    // DISC-03: paste hidden by moderation is excluded from the feed
    @Test
    void DISC_03_feed_excludesModerationHiddenPaste() throws Exception {
        MockHttpSession owner = registerAndLogin("disc03" + uid);
        String marker = "disc03m" + uid;
        String visible = createPaste(owner, "Visible " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String hidden = createPaste(owner, "Hidden " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", hidden);

        List<String> ids = feedIds("q=" + marker);
        assertTrue(ids.contains(visible), "eligible paste must remain");
        assertTrue(!ids.contains(hidden), "moderation-hidden paste must be excluded from discovery feed");
    }

    // DISC-04: q matches title (case-insensitive)
    @Test
    void DISC_04_search_matchesTitle() throws Exception {
        MockHttpSession owner = registerAndLogin("disc04" + uid);
        String marker = "FindableTitle" + uid;
        String p = createPaste(owner, "has " + marker + " in title", "nothing here", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String other = createPaste(owner, "boring title " + uid, "content", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        List<String> ids = feedIds("q=" + marker.toLowerCase());
        assertTrue(ids.contains(p), "search by title must find the paste");
        assertTrue(!ids.contains(other), "non-matching paste must not appear in search results");
    }

    // DISC-05: q matches content (case-insensitive)
    @Test
    void DISC_05_search_matchesContent() throws Exception {
        MockHttpSession owner = registerAndLogin("disc05" + uid);
        String needle = "needlecontent" + uid;
        String p = createPaste(owner, "plain title " + uid, "int x = 1; // " + needle.toUpperCase(), "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String other = createPaste(owner, "other title " + uid, "no needle here", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        List<String> ids = feedIds("q=" + needle);
        assertTrue(ids.contains(p), "search by content must find the paste");
        assertTrue(!ids.contains(other), "non-matching paste must not appear");
    }

    // DISC-06: q matches tag names
    @Test
    void DISC_06_search_matchesTagName() throws Exception {
        MockHttpSession owner = registerAndLogin("disc06" + uid);
        String tag = "tagsearch" + uid;
        String p = createPaste(owner, "untagged-title " + uid, "content", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, p, tag);
        String other = createPaste(owner, "other-untagged " + uid, "content", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        List<String> ids = feedIds("q=" + tag);
        assertTrue(ids.contains(p), "search by tag name must find the tagged paste");
        assertTrue(!ids.contains(other), "paste without the tag must not appear");
    }

    // DISC-07: tag filter parameter
    @Test
    void DISC_07_tagFilter_returnsOnlyTaggedPastes() throws Exception {
        MockHttpSession owner = registerAndLogin("disc07" + uid);
        String tag = "tagfilter" + uid;
        String marker = "disc07m" + uid;
        String tagged1 = createPaste(owner, "Tagged1 " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String tagged2 = createPaste(owner, "Tagged2 " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String untagged = createPaste(owner, "Untagged " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, tagged1, tag);
        addTag(owner, tagged2, tag);

        List<String> ids = feedIds("q=" + marker + "&tag=" + tag);
        assertTrue(ids.contains(tagged1) && ids.contains(tagged2), "tagged pastes must match tag filter");
        assertTrue(!ids.contains(untagged), "untagged paste must not match tag filter");
    }

    // DISC-08: language + tag + q + window combine
    @Test
    void DISC_08_combinedFilters_compose() throws Exception {
        MockHttpSession owner = registerAndLogin("disc08" + uid);
        String tag = "combo" + uid;
        String marker = "disc08m" + uid;

        String match = createPaste(owner, "Match " + marker, "needlecombo" + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, match, tag);
        String wrongLang = createPaste(owner, "WrongLang " + marker, "needlecombo" + uid, "python", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, wrongLang, tag);
        String wrongTag = createPaste(owner, "WrongTag " + marker, "needlecombo" + uid, "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, wrongTag, "othertag" + uid);
        String wrongNeedle = createPaste(owner, "WrongNeedle " + marker, "different text", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, wrongNeedle, tag);

        List<String> ids = feedIds("q=needlecombo" + uid + "&tag=" + tag + "&language=java&window=all");
        assertTrue(ids.contains(match), "only the paste matching every filter must be returned");
        assertTrue(!ids.contains(wrongLang), "language filter must exclude");
        assertTrue(!ids.contains(wrongTag), "tag filter must exclude");
        assertTrue(!ids.contains(wrongNeedle), "query filter must exclude");
    }

    // DISC-09: window filter boundaries (24h / 7d / 30d / all)
    @Test
    void DISC_09_windowFilter_boundaries() throws Exception {
        MockHttpSession owner = registerAndLogin("disc09" + uid);
        String marker = "disc09m" + uid;
        String recent = createPaste(owner, "Recent " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String week = createPaste(owner, "Week " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String month = createPaste(owner, "Month " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        backdateCreatedAt(recent, Instant.now().minusSeconds(2 * 3600));
        backdateCreatedAt(week, Instant.now().minusSeconds(2 * 24 * 3600));
        backdateCreatedAt(month, Instant.now().minusSeconds(10 * 24 * 3600));

        assertTrue(feedIds("q=" + marker + "&window=24h").containsAll(List.of(recent))
                && !feedIds("q=" + marker + "&window=24h").contains(week), "24h window excludes 2-day-old paste");
        List<String> sevenDay = feedIds("q=" + marker + "&window=7d");
        assertTrue(sevenDay.contains(recent) && sevenDay.contains(week) && !sevenDay.contains(month),
                "7d window includes 2h and 2d pastes, excludes 10d paste");
        List<String> thirtyDay = feedIds("q=" + marker + "&window=30d");
        assertTrue(thirtyDay.contains(recent) && thirtyDay.contains(week) && thirtyDay.contains(month),
                "30d window includes all three");
        List<String> all = feedIds("q=" + marker + "&window=all");
        assertTrue(all.contains(recent) && all.contains(week) && all.contains(month), "all window includes everything");
    }

    // DISC-10: deterministic pagination (createdAt DESC, id ASC tie-break; no dup/skip across pages)
    @Test
    void DISC_10_pagination_deterministicOrder() throws Exception {
        MockHttpSession owner = registerAndLogin("disc10" + uid);
        String marker = "disc10m" + uid;
        List<String> created = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            created.add(createPaste(owner, "Page " + marker + " " + i, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER));
        }
        // Force identical timestamps so ordering must be resolved by the id tie-break
        Instant sameTimestamp = Instant.now().minusSeconds(3600);
        for (String id : created) {
            backdateCreatedAt(id, sameTimestamp);
        }

        MvcResult single = mockMvc.perform(get("/api/v1/discovery?q=" + marker + "&size=50"))
                .andExpect(status().isOk()).andReturn();
        JsonNode singleItems = objectMapper.readTree(single.getResponse().getContentAsString()).get("items");
        List<String> expectedOrder = new ArrayList<>();
        singleItems.forEach(n -> expectedOrder.add(n.get("id").asText()));
        List<String> sorted = new ArrayList<>(expectedOrder);
        sorted.sort(String::compareTo);
        assertTrue(expectedOrder.equals(sorted), "with identical createdAt, order must be id ASC");

        List<String> paged = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            paged.addAll(feedIds("q=" + marker + "&size=10&page=" + page));
        }
        assertTrue(paged.equals(expectedOrder), "paginated concatenation must equal single-page order, got " + paged.size()
                + " vs " + expectedOrder.size());
    }

    // DISC-11: invalid filter parameters are rejected with 400
    @Test
    void DISC_11_invalidParams_rejectedWith400() throws Exception {
        mockMvc.perform(get("/api/v1/discovery?q=" + "x".repeat(201)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/discovery?tag=" + "x".repeat(51)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/discovery?window=fortnight"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/discovery?sort=popularity"))
                .andExpect(status().isBadRequest());
    }

    // DISC-13: author attribution + additive fields (tags, starsCount); orphan paste has null author
    @Test
    void DISC_13_authorAttribution_andAdditiveFields() throws Exception {
        MockHttpSession owner = registerAndLogin("disc13" + uid);
        String marker = "disc13m" + uid;
        String owned = createPaste(owner, "Owned " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        addTag(owner, owned, "authortag" + uid);

        String orphan = createPaste(owner, "Orphan " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        jdbc.update("UPDATE pastes SET user_id = NULL WHERE public_id = ?", orphan);

        MvcResult result = mockMvc.perform(get("/api/v1/discovery?q=" + marker + "&size=10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].authorUsername", hasItem("disc13" + uid)))
                .andExpect(jsonPath("$.items[*].authorUsername", hasItem(nullValue())))
                .andExpect(jsonPath("$.items[*].tags", hasItem(hasItem("authortag" + uid))))
                .andExpect(jsonPath("$.items[*].starsCount", hasItem(0)))
                .andReturn();

        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        assertTrue(items.size() == 2, "orphan + owned must both be eligible, got " + items.size());
    }

    // DISC-14: LIKE wildcards in q are escaped (literal match)
    @Test
    void DISC_14_search_escapesLikeWildcards() throws Exception {
        MockHttpSession owner = registerAndLogin("disc14" + uid);
        String marker = "disc14m" + uid;
        String percent = createPaste(owner, "100% Solid " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String underscore = createPaste(owner, "under_score " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        String plain = createPaste(owner, "plain title " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER);

        List<String> percentIds = feedIdsWithParam("100%");
        assertTrue(percentIds.contains(percent), "literal % query must match the paste containing %");
        assertTrue(!percentIds.contains(plain) && !percentIds.contains(underscore),
                "literal % must not act as a wildcard");

        List<String> underIds = feedIdsWithParam("under_score");
        assertTrue(underIds.contains(underscore), "literal _ query must match the paste containing _");
        assertTrue(!underIds.contains(plain), "literal _ must not act as a wildcard");
    }

    // DISC-15: legacy response shape preserved (compatibility guard; passes in red by design)
    @Test
    void DISC_15_legacyResponseShape_preserved() throws Exception {
        MockHttpSession owner = registerAndLogin("disc15" + uid);
        String marker = "disc15m" + uid;
        // ONE_DAY so expiresAt is non-null and its presence is assertable via JSON path
        createPaste(owner, "Legacy " + marker, "c", "java", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY);

        MvcResult result = mockMvc.perform(get("/api/v1/discovery?q=" + marker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").exists())
                .andExpect(jsonPath("$.items[0].title").exists())
                .andExpect(jsonPath("$.items[0].language").exists())
                .andExpect(jsonPath("$.items[0].visibility").exists())
                .andExpect(jsonPath("$.items[0].contentSizeBytes").exists())
                .andExpect(jsonPath("$.items[0].lineCount").exists())
                .andExpect(jsonPath("$.items[0].createdAt").exists())
                .andExpect(jsonPath("$.items[0].expiresAt").exists())
                .andExpect(jsonPath("$.items[0].version").exists())
                .andExpect(jsonPath("$.items[0].views").exists())
                .andExpect(jsonPath("$.totalElements").exists())
                .andExpect(jsonPath("$.totalPages").exists())
                .andReturn();
        assertTrue(result.getResponse().getStatus() == 200);
    }
}
