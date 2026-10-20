package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreateFolderRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.MovePasteRequest;
import com.pastebin.paste.api.dto.RenameFolderRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FolderSecurityIntegrationTest {

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

    private MockHttpSession registerAndLogin(String username, String email) throws Exception {
        RegisterRequest registerReq = new RegisterRequest(username, email, "SecretPass123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerReq)))
                .andExpect(status().isCreated());

        LoginRequest loginReq = new LoginRequest(username, "SecretPass123!");
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk())
                .andReturn();

        return (MockHttpSession) loginResult.getRequest().getSession();
    }

    @Test
    @DisplayName("Unauthenticated requests to folder endpoints must return 401")
    void unauthenticatedAccessDenied() throws Exception {
        mockMvc.perform(get("/api/v1/folders"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/folders")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Folder CRUD, duplicate name rejection, paste movement and orphan policy")
    void folderLifecycleAndSecurityBoundaries() throws Exception {
        MockHttpSession aliceSession = registerAndLogin("folder_alice", "alice@folder.com");
        MockHttpSession bobSession = registerAndLogin("folder_bob", "bob@folder.com");

        // 1. Alice creates folder "Projects"
        CreateFolderRequest createProjects = new CreateFolderRequest("Projects");
        MvcResult folderRes = mockMvc.perform(post("/api/v1/folders")
                        .with(csrf())
                        .session(aliceSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createProjects)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Projects"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andReturn();

        long aliceFolderId = objectMapper.readTree(folderRes.getResponse().getContentAsString()).get("id").asLong();

        // 2. Alice tries to create duplicate folder "projects" (case-insensitive duplicate check) -> 409 Conflict
        CreateFolderRequest duplicateReq = new CreateFolderRequest("projects");
        mockMvc.perform(post("/api/v1/folders")
                        .with(csrf())
                        .session(aliceSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(duplicateReq)))
                .andExpect(status().isConflict());

        // 3. Bob CAN create a folder named "Projects" (folders are user-scoped)
        mockMvc.perform(post("/api/v1/folders")
                        .with(csrf())
                        .session(bobSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createProjects)))
                .andExpect(status().isCreated());

        // 4. Bob cannot list Alice's folders (IDOR isolation)
        MvcResult bobFolders = mockMvc.perform(get("/api/v1/folders").session(bobSession))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode bobTree = objectMapper.readTree(bobFolders.getResponse().getContentAsString());
        assertThat(bobTree.get("folders").size()).isEqualTo(1);
        assertThat(bobTree.get("folders").get(0).get("id").asLong()).isNotEqualTo(aliceFolderId);

        // 5. Bob cannot rename or delete Alice's folder -> 404 Not Found
        mockMvc.perform(put("/api/v1/folders/" + aliceFolderId)
                        .with(csrf())
                        .session(bobSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RenameFolderRequest("Hacked"))))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/v1/folders/" + aliceFolderId)
                        .with(csrf())
                        .session(bobSession))
                .andExpect(status().isNotFound());

        // 6. Alice creates a paste assigned to her folder
        CreatePasteRequest createPaste = new CreatePasteRequest(
                "Alice Script",
                "console.log('in folder');",
                "javascript",
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER,
                null,
                null,
                aliceFolderId
        );

        MvcResult pasteRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .session(aliceSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createPaste)))
                .andExpect(status().isCreated())
                .andReturn();

        String alicePasteId = objectMapper.readTree(pasteRes.getResponse().getContentAsString()).get("id").asText();

        // 7. Verify Alice's folder list shows 1 active paste
        mockMvc.perform(get("/api/v1/folders").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.folders[0].pasteCount").value(1));

        // 8. Bob cannot move Alice's paste into Bob's folder
        mockMvc.perform(put("/api/v1/folders/pastes/" + alicePasteId + "/move")
                        .with(csrf())
                        .session(bobSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new MovePasteRequest(null))))
                .andExpect(status().isNotFound());

        // 9. Alice cannot move her paste to Bob's folder
        MvcResult bobFolderResult = mockMvc.perform(get("/api/v1/folders").session(bobSession)).andReturn();
        long bobsFolderId = objectMapper.readTree(bobFolderResult.getResponse().getContentAsString()).get("folders").get(0).get("id").asLong();

        mockMvc.perform(put("/api/v1/folders/pastes/" + alicePasteId + "/move")
                        .with(csrf())
                        .session(aliceSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new MovePasteRequest(bobsFolderId))))
                .andExpect(status().isBadRequest());

        // 10. Orphan policy: Alice deletes her folder -> her paste is NOT deleted; it moves to Unfiled!
        mockMvc.perform(delete("/api/v1/folders/" + aliceFolderId)
                        .with(csrf())
                        .session(aliceSession))
                .andExpect(status().isNoContent());

        // Paste still exists and is accessible
        mockMvc.perform(get("/api/v1/pastes/" + alicePasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(alicePasteId));

        // Account list for unfiled shows Alice's paste
        mockMvc.perform(get("/api/v1/account/pastes?unfiled=true").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(alicePasteId))
                .andExpect(jsonPath("$.items[0].folderId").isEmpty());
    }
}
