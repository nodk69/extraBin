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

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MV-01..MV-05: moderation_state policy on direct access and embeds (Increment 1).
 * HIDDEN public paste: non-owner direct view and embed -> indistinguishable 404;
 * owner direct view -> 200 with moderationHidden flag; default state ACTIVE (V16).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ModerationVisibilityIntegrationTest {

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

    private String createPublicPaste(MockHttpSession owner, String title) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreatePasteRequest(title, "content", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private String notFoundTypeOf(String pasteId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.has("type") ? body.get("type").asText() : "";
    }

    // MV-01: hidden paste returns the same indistinguishable 404 as a nonexistent paste for non-owners
    @Test
    void MV_01_hiddenPaste_indistinguishable404_forNonOwner() throws Exception {
        MockHttpSession owner = registerAndLogin("mv01" + uid);
        String p = createPublicPaste(owner, "MV01 hidden " + uid);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", p);

        MvcResult hiddenResult = mockMvc.perform(get("/api/v1/pastes/" + p))
                .andExpect(status().isNotFound())
                .andReturn();
        MvcResult missingResult = mockMvc.perform(get("/api/v1/pastes/doesnotexist" + uid))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode hiddenBody = objectMapper.readTree(hiddenResult.getResponse().getContentAsString());
        JsonNode missingBody = objectMapper.readTree(missingResult.getResponse().getContentAsString());
        assertEquals(missingBody.path("type").asText(), hiddenBody.path("type").asText(),
                "hidden and nonexistent pastes must return identical ProblemDetails type");
        assertEquals(missingBody.path("title").asText(), hiddenBody.path("title").asText(),
                "hidden and nonexistent pastes must return identical ProblemDetails title");
    }

    // MV-02: owner still sees own hidden paste, with moderationHidden flag set
    @Test
    void MV_02_hiddenPaste_ownerSeesWithFlag() throws Exception {
        MockHttpSession owner = registerAndLogin("mv02" + uid);
        String p = createPublicPaste(owner, "MV02 owner view " + uid);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", p);

        mockMvc.perform(get("/api/v1/pastes/" + p).session(owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.moderationHidden").value(true));
    }

    // MV-03: embed surface rejects hidden pastes
    @Test
    void MV_03_hiddenPaste_embedRejected() throws Exception {
        MockHttpSession owner = registerAndLogin("mv03" + uid);
        String p = createPublicPaste(owner, "MV03 embed " + uid);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", p);

        mockMvc.perform(get("/api/v1/pastes/" + p + "/embed"))
                .andExpect(status().isNotFound());
    }

    // MV-04: restoring moderation state re-enables public access
    @Test
    void MV_04_restoredPaste_publicAccessAgain() throws Exception {
        MockHttpSession owner = registerAndLogin("mv04" + uid);
        String p = createPublicPaste(owner, "MV04 restore " + uid);
        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", p);
        mockMvc.perform(get("/api/v1/pastes/" + p)).andExpect(status().isNotFound());

        jdbc.update("UPDATE pastes SET moderation_state = 'ACTIVE' WHERE public_id = ?", p);
        mockMvc.perform(get("/api/v1/pastes/" + p)).andExpect(status().isOk());
    }

    // MV-05: V16 default — every new paste starts with moderation_state ACTIVE
    @Test
    void MV_05_newPaste_defaultsToActiveModerationState() throws Exception {
        MockHttpSession owner = registerAndLogin("mv05" + uid);
        String p = createPublicPaste(owner, "MV05 default " + uid);

        String state = jdbc.queryForObject(
                "SELECT moderation_state FROM pastes WHERE public_id = ?", String.class, p);
        assertNotNull(state);
        assertEquals("ACTIVE", state, "fresh pastes must default to moderation_state ACTIVE");
    }
}
