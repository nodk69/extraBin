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

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * EC-01..EC-03: every public discovery surface must apply the SAME eligibility predicate.
 * Contract: one shared policy (visibility=PUBLIC, not expired, no burn, no password, not encrypted,
 * moderation_state=ACTIVE) enforced identically across feed, search, tags, and most-saved.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EligibilityConsistencyIntegrationTest {

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
    private String marker;
    private MockHttpSession owner;
    private String live;
    private String orphan;
    private String expired;
    private String burn;
    private String password;
    private String encrypted;
    private String hidden;
    private String priv;
    private String unlisted;

    @BeforeEach
    void setUp() throws Exception {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        marker = "ecm" + uid;

        owner = registerAndLogin("ec01" + uid);
        String lang = "ec" + uid;

        live = createPaste(owner, "Live " + marker, lang);
        orphan = createPaste(owner, "Orphan " + marker, lang);
        jdbc.update("UPDATE pastes SET user_id = NULL WHERE public_id = ?", orphan);

        expired = createPaste(owner, "Expired " + marker, lang);
        jdbc.update("UPDATE pastes SET expires_at = ? WHERE public_id = ?", Timestamp.from(Instant.now().minusSeconds(60)), expired);

        burn = createPaste(owner, "Burn " + marker, lang);
        jdbc.update("UPDATE pastes SET burn_after_reading = TRUE WHERE public_id = ?", burn);

        password = createPaste(owner, "Pwd " + marker, lang);
        jdbc.update("UPDATE pastes SET password_hash = '$2a$10$dummyhashdummyhashdummyhashdummyhashdummy' WHERE public_id = ?", password);

        encrypted = createPaste(owner, "Enc " + marker, lang);
        // chk_pastes_kdf_params requires complete KDF state when encryption_mode is set
        byte[] encSalt = new byte[16];
        byte[] encWrappedKey = new byte[60];
        jdbc.update("UPDATE pastes SET encryption_mode = 'LINK', kdf_salt = ?, kdf_iterations = ?, wrapped_key = ? WHERE public_id = ?",
                encSalt, 100_000, encWrappedKey, encrypted);

        hidden = createPaste(owner, "Hidden " + marker, lang);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", hidden);

        priv = createPaste(owner, "Priv " + marker, lang);
        jdbc.update("UPDATE pastes SET visibility = 'PRIVATE' WHERE public_id = ?", priv);

        unlisted = createPaste(owner, "Unl " + marker, lang);
        // chk_pastes_not_applicable_state (V12): UNLISTED requires a non-NOT_APPLICABLE share state;
        // LEGACY_OPEN is the share state of an unlisted paste without a token hash or revocation.
        jdbc.update("UPDATE pastes SET visibility = 'UNLISTED', share_access_state = 'LEGACY_OPEN' WHERE public_id = ?", unlisted);
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

    private String createPaste(MockHttpSession session, String title, String language) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreatePasteRequest(title, "content", language, Visibility.PUBLIC, ExpirationPolicy.NEVER))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private List<String> eligible() {
        return List.of(live, orphan);
    }

    private List<String> ineligible() {
        return List.of(expired, burn, password, encrypted, hidden, priv, unlisted);
    }

    // EC-01: feed and search return exactly the eligible set
    @Test
    void EC_01_feedAndSearch_identicalEligibleSet() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery?q=" + marker + "&size=50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItems(live, orphan)))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(expired))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(burn))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(password))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(encrypted))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(hidden))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(priv))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(unlisted))))
                .andReturn();

        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        assertEquals(eligible().size(), items.size(),
                "search must return exactly the eligible fixtures (got " + items.size() + ")");
    }

    // EC-02: tags and most-saved enforce the same predicate
    @Test
    void EC_02_tagsAndMostSaved_samePredicate() throws Exception {
        String tag = "ectag" + uid;
        mockMvc.perform(post("/api/v1/pastes/" + live + "/tags").with(csrf()).session(owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"" + tag + "\"}"))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/v1/pastes/" + hidden + "/tags").with(csrf()).session(owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"" + tag + "\"}"))
                .andExpect(status().isCreated());
        // Fixture note: an expired paste cannot be tagged through the API (active-only lookup, 404),
        // so the tag is attached at persistence level to verify the tag cloud excludes ineligible pastes.
        Long expiredRowId = jdbc.queryForObject("SELECT id FROM pastes WHERE public_id = ?", Long.class, expired);
        Long tagRowId = jdbc.queryForObject("SELECT id FROM tags WHERE name = ?", Long.class, tag);
        jdbc.update("INSERT INTO paste_tags (paste_id, tag_id) VALUES (?, ?)", expiredRowId, tagRowId);

        MvcResult tagsResult = mockMvc.perform(get("/api/v1/discovery/tags"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode tagEntries = objectMapper.readTree(tagsResult.getResponse().getContentAsString());
        int tagCount = -1;
        for (JsonNode el : tagEntries) {
            if (tag.equals(el.get("name").asText())) {
                tagCount = el.get("pasteCount").asInt();
            }
        }
        assertEquals(1, tagCount, "tag count must include only the eligible paste");

        // Most-saved: star live (by another user) and hidden (by its owner — non-owners get the
        // indistinguishable 404 from the moderation gate); only the eligible paste may surface.
        MockHttpSession starrer = registerAndLogin("ec02" + uid);
        mockMvc.perform(post("/api/v1/pastes/" + live + "/star").with(csrf()).session(starrer))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/pastes/" + hidden + "/star").with(csrf()).session(owner))
                .andExpect(status().isOk());

        MvcResult result = mockMvc.perform(get("/api/v1/discovery/most-saved?language=ec" + uid + "&size=10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItem(live)))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(hidden))))
                .andReturn();
        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        assertEquals(1, items.size(), "only the eligible starred paste may appear");
    }

    // EC-03: totalElements reflects the same predicate
    @Test
    void EC_03_totalElements_matchesEligibleCount() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery?q=" + marker + "&size=50"))
                .andExpect(status().isOk())
                .andReturn();
        long total = objectMapper.readTree(result.getResponse().getContentAsString()).get("totalElements").asLong();
        assertEquals(eligible().size(), total,
                "totalElements for marker query must equal eligible fixture count");
    }
}
