package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EmbedSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        rateLimiterService.clear();
    }

    private MockHttpSession registerAndLogin(String username, String email) throws Exception {
        com.pastebin.identity.api.dto.RegisterRequest registerReq = new com.pastebin.identity.api.dto.RegisterRequest(username, email, "SecretPass123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerReq)))
                .andExpect(status().isCreated());

        com.pastebin.identity.api.dto.LoginRequest loginReq = new com.pastebin.identity.api.dto.LoginRequest(username, "SecretPass123!");
        org.springframework.test.web.servlet.MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk())
                .andReturn();

        return (org.springframework.mock.web.MockHttpSession) loginResult.getRequest().getSession();
    }

    private String createPaste(String title, String content, Visibility visibility, ExpirationPolicy expiration, String password, org.springframework.mock.web.MockHttpSession session) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                title,
                content,
                "typescript",
                visibility,
                expiration,
                password,
                List.of(new com.pastebin.paste.api.dto.PasteFileRequest("index.ts", content, "typescript")),
                null
        );

        var requestBuilder = post("/api/v1/pastes")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request));

        if (session != null) {
            requestBuilder.session(session);
        }

        String responseBody = mockMvc.perform(requestBuilder)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        CreatePasteResponse response = objectMapper.readValue(responseBody, CreatePasteResponse.class);
        return response.id();
    }

    private String createPaste(String title, String content, Visibility visibility, ExpirationPolicy expiration, String password) throws Exception {
        return createPaste(title, content, visibility, expiration, password, null);
    }

    @Test
    @DisplayName("Eligible public paste can be embedded and returns no-store cache headers")
    void shouldAllowEmbedForPublicPaste() throws Exception {
        String pasteId = createPaste("Public Embed API", "const a = 1;", Visibility.PUBLIC, ExpirationPolicy.NEVER, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", pasteId))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.publicId").value(pasteId))
                .andExpect(jsonPath("$.title").value("Public Embed API"))
                .andExpect(jsonPath("$.files[0].content").value("const a = 1;"));
    }

    @Test
    @DisplayName("Private paste must be rejected for embed")
    void shouldRejectEmbedForPrivatePaste() throws Exception {
        var userSession = registerAndLogin("embed_user", "embed_user@pastebin.dev");
        String pasteId = createPaste("Private Paste", "secret content", Visibility.PRIVATE, ExpirationPolicy.NEVER, null, userSession);

        // An ineligible embed must be indistinguishable from a missing paste: the uniform
        // 404 Problem Details response, never a 403 that confirms the paste exists.
        mockMvc.perform(get("/api/v1/pastes/{id}/embed", pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("Unlisted paste must be rejected for embed")
    void shouldRejectEmbedForUnlistedPaste() throws Exception {
        String pasteId = createPaste("Unlisted Paste", "unlisted content", Visibility.UNLISTED, ExpirationPolicy.NEVER, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("Password-protected paste must not be bypassed via embed endpoint")
    void shouldRejectEmbedForPasswordProtectedPaste() throws Exception {
        String pasteId = createPaste("Locked Paste", "locked content", Visibility.PUBLIC, ExpirationPolicy.NEVER, "Pass1234!");

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // The embed endpoint never accepts a credential, so even the correct password
        // must not turn an ineligible embed into a success.
        mockMvc.perform(get("/api/v1/pastes/{id}/embed", pasteId)
                        .header("X-Paste-Password", "Pass1234!"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    @DisplayName("View-once paste must be rejected and NOT consumed by embed request")
    void shouldRejectEmbedForViewOncePasteAndNotConsumeIt() throws Exception {
        String pasteId = createPaste("Burn Paste", "burn me", Visibility.PUBLIC, ExpirationPolicy.BURN_AFTER_READING, null);

        // Embed request must fail with the uniform 404 used for unavailable pastes
        mockMvc.perform(get("/api/v1/pastes/{id}/embed", pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // Verify the paste is still present in the repository and was NOT consumed
        assertThat(pasteRepository.findActiveByPublicId(pasteId, Instant.now())).isPresent();
    }

    @Test
    @DisplayName("Expired or non-existent paste returns 404 for embed")
    void shouldReturn404ForNonExistentPaste() throws Exception {
        mockMvc.perform(get("/api/v1/pastes/{id}/embed", "non-existent-id-999"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Ineligible embed 404 is indistinguishable from a missing-paste 404 (no existence oracle)")
    void ineligibleEmbed404_isIndistinguishableFromMissingPaste404() throws Exception {
        // An unlisted paste exists but is not embed-eligible; a missing id does not exist.
        // Both answers must be the same 404 Problem Details payload.
        String ineligibleId = createPaste("Oracle Probe", "secret content", Visibility.UNLISTED, ExpirationPolicy.NEVER, null);
        String missingId = "definitely-missing-" + java.util.UUID.randomUUID();

        MvcResult hidden = mockMvc.perform(get("/api/v1/pastes/{id}/embed", ineligibleId))
                .andExpect(status().isNotFound())
                .andReturn();
        MvcResult missing = mockMvc.perform(get("/api/v1/pastes/{id}/embed", missingId))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode hiddenBody = objectMapper.readTree(hidden.getResponse().getContentAsString());
        JsonNode missingBody = objectMapper.readTree(missing.getResponse().getContentAsString());

        // Every oracle-bearing field must match: a caller must not be able to tell
        // "exists but ineligible" from "does not exist".
        assertThat(hiddenBody.path("status").asInt()).isEqualTo(missingBody.path("status").asInt());
        assertThat(hiddenBody.path("title").asText()).isEqualTo(missingBody.path("title").asText());
        assertThat(hiddenBody.path("type").asText()).isEqualTo(missingBody.path("type").asText());
        assertThat(hiddenBody.path("code").asText()).isEqualTo(missingBody.path("code").asText());
        assertThat(hiddenBody.path("detail").asText()).isEqualTo(missingBody.path("detail").asText());

        // The refusal must not describe the paste itself. Only the echoed request path
        // may contain the id, exactly as it does for a paste that never existed.
        assertThat(hiddenBody.path("detail").asText()).doesNotContain(ineligibleId);
        assertThat(hiddenBody.path("instance").asText())
                .isEqualTo("/api/v1/pastes/" + ineligibleId + "/embed");
    }
}
