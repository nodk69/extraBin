package com.pastebin;

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

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PT-01..PT-03: Public tag cloud over eligible pastes only.
 * Contract: GET /api/v1/discovery/tags -> [{name, pasteCount}], count DESC then name ASC, limit 50.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PublicTagsIntegrationTest {

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

    private String createPaste(MockHttpSession session, String title, String language) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreatePasteRequest(title, "content", language, Visibility.PUBLIC, ExpirationPolicy.NEVER))))
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

    private JsonNodeWrapper fetchTags() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery/tags"))
                .andExpect(status().isOk())
                .andReturn();
        return new JsonNodeWrapper(objectMapper.readTree(result.getResponse().getContentAsString()));
    }

    private int countFor(JsonNodeWrapper tags, String name) {
        var node = tags.findName(name);
        assertTrue(node != null, "tag " + name + " must be present in /discovery/tags");
        return node.get("pasteCount").asInt();
    }

    private static class JsonNodeWrapper {
        private final com.fasterxml.jackson.databind.JsonNode root;

        JsonNodeWrapper(com.fasterxml.jackson.databind.JsonNode root) {
            this.root = root;
        }

        com.fasterxml.jackson.databind.JsonNode findName(String name) {
            for (var el : root) {
                if (name.equals(el.get("name").asText())) {
                    return el;
                }
            }
            return null;
        }
    }

    // PT-01: tag counts only count distinct eligible pastes
    @Test
    void PT_01_tagCounts_onlyEligiblePastes() throws Exception {
        MockHttpSession owner = registerAndLogin("pt01" + uid);
        String tag = "pt01tag" + uid;

        String live = createPaste(owner, "PT01 live " + uid, "java");
        addTag(owner, live, tag);

        String hidden = createPaste(owner, "PT01 hidden " + uid, "java");
        addTag(owner, hidden, tag);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", hidden);

        String expired = createPaste(owner, "PT01 expired " + uid, "java");
        addTag(owner, expired, tag);
        jdbc.update("UPDATE pastes SET expires_at = ? WHERE public_id = ?", Timestamp.from(Instant.now().minusSeconds(60)), expired);

        String priv = createPaste(owner, "PT01 private " + uid, "java");
        addTag(owner, priv, tag);
        jdbc.update("UPDATE pastes SET visibility = 'PRIVATE' WHERE public_id = ?", priv);

        assertTrue(countFor(fetchTags(), tag) == 1, "tag count must include only the eligible public paste");
    }

    // PT-02: ordering (count DESC, name ASC for ties) and 50-entry limit
    @Test
    void PT_02_ordering_andLimit() throws Exception {
        MockHttpSession owner = registerAndLogin("pt02" + uid);

        String tagX = "pt02x" + uid; // count 2
        String tagY = "pt02y" + uid; // count 2
        String tagZ = "pt02z" + uid; // count 3
        String tagA = "pt02a" + uid; // count 1

        String p1 = createPaste(owner, "PT02 p1 " + uid, "java");
        String p2 = createPaste(owner, "PT02 p2 " + uid, "java");
        String p3 = createPaste(owner, "PT02 p3 " + uid, "java");

        addTag(owner, p1, tagZ);
        addTag(owner, p2, tagZ);
        addTag(owner, p3, tagZ);
        addTag(owner, p1, tagX);
        addTag(owner, p2, tagX);
        addTag(owner, p1, tagY);
        addTag(owner, p2, tagY);
        addTag(owner, p1, tagA);

        JsonNodeWrapper tags = fetchTags();
        List<String> mine = new ArrayList<>(List.of(tagA, tagX, tagY, tagZ));
        mine.sort((a, b) -> {
            int byCount = Integer.compare(countFor(tags, b), countFor(tags, a));
            return byCount != 0 ? byCount : a.compareTo(b);
        });

        MvcResult result = mockMvc.perform(get("/api/v1/discovery/tags"))
                .andExpect(status().isOk())
                .andReturn();
        List<String> allNames = new ArrayList<>();
        com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        root.forEach(el -> allNames.add(el.get("name").asText()));

        List<Integer> positions = mine.stream().map(allNames::indexOf).toList();
        assertTrue(positions.equals(positions.stream().sorted().toList()),
                "expected order " + mine + " (count DESC, name ASC) but got positions " + positions + " in " + allNames);
        assertTrue(allNames.size() <= 50, "public tag list must be limited to 50 entries, got " + allNames.size());
    }

    // PT-03: response carries no owner identifiers (data minimization)
    @Test
    void PT_03_noOwnerIdentifiers_inPublicTagPayload() throws Exception {
        MockHttpSession owner = registerAndLogin("pt03" + uid);
        String tag = "pt03tag" + uid;
        String p = createPaste(owner, "PT03 paste " + uid, "java");
        addTag(owner, p, tag);

        mockMvc.perform(get("/api/v1/discovery/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == '" + tag + "')].name").exists())
                .andExpect(jsonPath("$[*].userId").doesNotExist())
                .andExpect(jsonPath("$[*].ownerId").doesNotExist())
                .andExpect(jsonPath("$[*].user").doesNotExist());
    }
}
