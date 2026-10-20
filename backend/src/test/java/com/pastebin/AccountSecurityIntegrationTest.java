package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext
class AccountSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void userLifecycle_registrationLoginPrivatePasteAndIsolation() throws Exception {
        // 1. Register User A
        RegisterRequest registerUserA = new RegisterRequest("alice", "alice@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerUserA)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(jsonPath("$.email").value("alice@example.com"));

        // 2. Duplicate registration rejected
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerUserA)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESOURCE_CONFLICT"));

        // 3. Bad credentials rejected
        LoginRequest badLogin = new LoginRequest("alice", "WrongPassword");
        mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(badLogin)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        // 4. Successful login establishes session
        LoginRequest validLogin = new LoginRequest("alice@example.com", "Password123!");
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validLogin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"))
                .andReturn();

        org.springframework.mock.web.MockHttpSession aliceSession = 
                (org.springframework.mock.web.MockHttpSession) loginResult.getRequest().getSession();
        assertThat(aliceSession).isNotNull();

        // 5. Verify session works on /auth/me
        mockMvc.perform(get("/api/v1/auth/me").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"));

        // 6. User A creates a PRIVATE paste
        CreatePasteRequest privatePasteReq = new CreatePasteRequest(
                "Alice Private Notes",
                "Secret API Keys and notes",
                "plaintext",
                Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .session(aliceSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(privatePasteReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andReturn();

        JsonNode createdPaste = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String privatePasteId = createdPaste.get("id").asText();

        // 7. Alice can view her own private paste
        mockMvc.perform(get("/api/v1/pastes/" + privatePasteId).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isOwner").value(true))
                .andExpect(jsonPath("$.content").value("Secret API Keys and notes"));

        // 8. Anonymous user cannot view Alice's private paste (must return 404 to conceal existence)
        mockMvc.perform(get("/api/v1/pastes/" + privatePasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // 9. Register and login User B (Bob)
        RegisterRequest registerUserB = new RegisterRequest("bob", "bob@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerUserB)))
                .andExpect(status().isCreated());

        LoginRequest loginB = new LoginRequest("bob", "Password123!");
        MvcResult loginResultB = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginB)))
                .andExpect(status().isOk())
                .andReturn();

        org.springframework.mock.web.MockHttpSession bobSession = 
                (org.springframework.mock.web.MockHttpSession) loginResultB.getRequest().getSession();
        assertThat(bobSession).isNotNull();

        // 10. Bob cannot view Alice's private paste (returns 404 to conceal existence)
        mockMvc.perform(get("/api/v1/pastes/" + privatePasteId).session(bobSession))
                .andExpect(status().isNotFound());

        // 11. Bob cannot access raw or download of Alice's private paste
        mockMvc.perform(get("/api/v1/pastes/" + privatePasteId + "/raw").session(bobSession))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/pastes/" + privatePasteId + "/download").session(bobSession))
                .andExpect(status().isNotFound());

        // 12. Logout invalidates session
        mockMvc.perform(post("/api/v1/auth/logout")
                        .with(csrf())
                        .session(aliceSession))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/auth/me").session(aliceSession))
                .andExpect(status().isUnauthorized());
    }
}
