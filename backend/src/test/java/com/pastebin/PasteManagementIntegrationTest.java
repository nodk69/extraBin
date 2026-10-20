package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasteManagementIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        rateLimiterService.clear();
    }

    @Test
    void pasteManagement_editOptimisticLockingRevisionsAndDeletion() throws Exception {
        // 1. Register and login User A (carol)
        RegisterRequest registerCarol = new RegisterRequest("carol", "carol@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerCarol)))
                .andExpect(status().isCreated());

        LoginRequest loginCarol = new LoginRequest("carol", "Password123!");
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginCarol)))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession carolSession = (MockHttpSession) loginResult.getRequest().getSession();

        // 2. Carol creates a paste
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Carol Initial Code",
                "int x = 1;",
                "java",
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER
        );

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .session(carolSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // 3. Carol lists her pastes
        mockMvc.perform(get("/api/v1/account/pastes").session(carolSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(pasteId))
                .andExpect(jsonPath("$.items[0].title").value("Carol Initial Code"));

        // 4. Carol edits her paste with version 0
        EditPasteRequest editReq1 = new EditPasteRequest(
                "Carol Updated Code",
                "int x = 2; // updated",
                "java",
                Visibility.UNLISTED,
                0L
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                        .session(carolSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editReq1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Carol Updated Code"))
                .andExpect(jsonPath("$.visibility").value("UNLISTED"))
                .andExpect(jsonPath("$.content").value("int x = 2; // updated"))
                .andExpect(jsonPath("$.version").value(1));

        // 5. Stale write test: Carol tries to edit with stale version 0 -> 409 Conflict!
        EditPasteRequest staleEdit = new EditPasteRequest(
                "Stale Update Attempt",
                "int x = 999;",
                "java",
                Visibility.PUBLIC,
                0L // Stale version!
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                        .session(carolSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(staleEdit)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESOURCE_CONFLICT"));

        // 6. Carol inspects revision history -> 1 revision corresponding to original version
        mockMvc.perform(get("/api/v1/account/pastes/" + pasteId + "/revisions").session(carolSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].version").value(0))
                .andExpect(jsonPath("$[0].title").value("Carol Initial Code"))
                .andExpect(jsonPath("$[0].content").value("int x = 1;"));

        // 7. Register User D (dave)
        RegisterRequest registerDave = new RegisterRequest("dave", "dave@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerDave)))
                .andExpect(status().isCreated());

        LoginRequest loginDave = new LoginRequest("dave", "Password123!");
        MvcResult daveLoginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginDave)))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession daveSession = (MockHttpSession) daveLoginResult.getRequest().getSession();

        // 8. Dave cannot edit Carol's paste -> 404
        EditPasteRequest daveHack = new EditPasteRequest("Hacked Title", "hacked", "java", Visibility.PUBLIC, 1L);
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                        .session(daveSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(daveHack)))
                .andExpect(status().isNotFound());

        // 9. Dave cannot delete Carol's paste -> 404
        mockMvc.perform(delete("/api/v1/account/pastes/" + pasteId)
                        .session(daveSession)
                        .with(csrf()))
                .andExpect(status().isNotFound());

        // 10. Carol deletes her paste -> 204
        mockMvc.perform(delete("/api/v1/account/pastes/" + pasteId)
                        .session(carolSession)
                        .with(csrf()))
                .andExpect(status().isNoContent());

        // 11. Verify paste is gone
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound());
    }
}
