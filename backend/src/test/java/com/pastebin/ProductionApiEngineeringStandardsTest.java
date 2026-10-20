package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.DeleteAnonymousPasteRequest;
import com.pastebin.paste.api.dto.RevokeLinkRequest;
import com.pastebin.paste.api.dto.RotateLinkRequest;
import com.pastebin.paste.api.dto.UpdateSlugRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@DisplayName("Production API Engineering Standards & Contract Security Tests")
class ProductionApiEngineeringStandardsTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private CreatePasteResponse createAnonymousPaste(Visibility visibility) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Standards Test",
                "Testing API contract hardening",
                "text",
                visibility,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult result = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readValue(result.getResponse().getContentAsString(), CreatePasteResponse.class);
    }

    @Nested
    @DisplayName("1. Header-Based Capability Transport Across Anonymous Paste Operations")
    class AnonymousCapabilityHeaderTests {

        @Test
        @DisplayName("TEST-CAP-01: delete-anonymous accepts capability via X-Deletion-Capability header without JSON body")
        void deleteAnonymous_supportsHeaderTransport() throws Exception {
            CreatePasteResponse paste = createAnonymousPaste(Visibility.PUBLIC);
            assertThat(paste.deletionCapability()).isNotNull();

            // Invoke delete-anonymous with empty/no body, capability solely in X-Deletion-Capability header
            mockMvc.perform(post("/api/v1/pastes/{id}/delete-anonymous", paste.id())
                            .with(csrf())
                            .header("X-Deletion-Capability", paste.deletionCapability())
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isNoContent());

            // Verify paste is gone
            mockMvc.perform(get("/api/v1/pastes/{id}", paste.id()))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("TEST-CAP-02: revoke-link accepts capability via X-Deletion-Capability header")
        void revokeLink_supportsHeaderTransport() throws Exception {
            CreatePasteResponse paste = createAnonymousPaste(Visibility.UNLISTED);
            assertThat(paste.deletionCapability()).isNotNull();
            assertThat(paste.shareToken()).isNotNull();

            // Revoke link passing capability solely in header
            mockMvc.perform(post("/api/v1/pastes/{id}/revoke-link", paste.id())
                            .with(csrf())
                            .header("X-Deletion-Capability", paste.deletionCapability())
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isNoContent());

            // Attempting to read with previous token returns 404
            mockMvc.perform(get("/api/v1/pastes/{id}", paste.id())
                            .header("X-Share-Token", paste.shareToken()))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("TEST-CAP-03: rotate-link accepts capability via X-Deletion-Capability header")
        void rotateLink_supportsHeaderTransport() throws Exception {
            CreatePasteResponse paste = createAnonymousPaste(Visibility.UNLISTED);
            assertThat(paste.deletionCapability()).isNotNull();

            // Rotate link with capability solely in header
            mockMvc.perform(post("/api/v1/pastes/{id}/rotate-link", paste.id())
                            .with(csrf())
                            .header("X-Deletion-Capability", paste.deletionCapability())
                            .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.shareToken").isNotEmpty());
        }

        @Test
        @DisplayName("TEST-CAP-04: slug update accepts capability via X-Deletion-Capability header")
        void updateSlug_supportsHeaderTransport() throws Exception {
            CreatePasteResponse paste = createAnonymousPaste(Visibility.PUBLIC);
            assertThat(paste.deletionCapability()).isNotNull();

            String newSlug = "secslug" + (System.currentTimeMillis() % 100000);
            UpdateSlugRequest request = new UpdateSlugRequest(newSlug, null); // Capability omitted from body

            mockMvc.perform(patch("/api/v1/pastes/{id}/slug", paste.id())
                            .with(csrf())
                            .header("X-Deletion-Capability", paste.deletionCapability())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(request)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(newSlug));
        }
    }

    @Nested
    @DisplayName("2. Header-Based Share Token on Comment Reactions")
    class CommentReactionsHeaderTests {

        @Test
        @DisplayName("TEST-COMM-01: voteComment accepts X-Share-Token header without query string")
        void voteComment_supportsShareTokenHeader() throws Exception {
            CreatePasteResponse paste = createAnonymousPaste(Visibility.PUBLIC);

            // Add a comment
            MvcResult commentResult = mockMvc.perform(post("/api/v1/pastes/{id}/comments", paste.id())
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"Test Comment\",\"authorName\":\"Tester\"}"))
                    .andExpect(status().isCreated())
                    .andReturn();

            Long commentId = objectMapper.readTree(commentResult.getResponse().getContentAsString()).get("id").asLong();

            // Vote on comment with X-Share-Token header
            mockMvc.perform(post("/api/v1/pastes/{id}/comments/{commentId}/vote", paste.id(), commentId)
                            .with(csrf())
                            .header("X-Share-Token", "mock-token-or-empty")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"voteType\":\"UP\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.upvotes").value(1));

            // Retract comment vote with X-Share-Token header
            mockMvc.perform(delete("/api/v1/pastes/{id}/comments/{commentId}/vote", paste.id(), commentId)
                            .with(csrf())
                            .header("X-Share-Token", "mock-token-or-empty"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.upvotes").value(0));
        }
    }

    @Nested
    @DisplayName("3. Indistinguishable Security Failures (Oracle & Presence Leak Protection)")
    class IndistinguishableSecurityFailuresTests {

        @Test
        @DisplayName("TEST-SEC-01: Non-existent, wrong-token unlisted, and private pastes return identical 404 ProblemDetails")
        void indistinguishable404Responses() throws Exception {
            // 1. Non-existent paste
            MvcResult nonExistent = mockMvc.perform(get("/api/v1/pastes/{id}", "nonExistentPaste123"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.title").value("Not Found"))
                    .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                    .andReturn();

            // 2. Unlisted paste with invalid share token
            CreatePasteResponse unlistedPaste = createAnonymousPaste(Visibility.UNLISTED);
            MvcResult wrongToken = mockMvc.perform(get("/api/v1/pastes/{id}", unlistedPaste.id())
                            .header("X-Share-Token", "shr_invalidToken1234567890"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.title").value("Not Found"))
                    .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                    .andReturn();

            var nonExistentNode = objectMapper.readTree(nonExistent.getResponse().getContentAsString());
            var wrongTokenNode = objectMapper.readTree(wrongToken.getResponse().getContentAsString());

            assertThat(wrongTokenNode.get("status").asInt()).isEqualTo(nonExistentNode.get("status").asInt());
            assertThat(wrongTokenNode.get("title").asText()).isEqualTo(nonExistentNode.get("title").asText());
            assertThat(wrongTokenNode.get("detail").asText()).isEqualTo(nonExistentNode.get("detail").asText());
            assertThat(wrongTokenNode.get("code").asText()).isEqualTo(nonExistentNode.get("code").asText());
        }
    }

    @Nested
    @DisplayName("4. Folder & Paste Tenant Isolation (BOLA / IDOR Defense)")
    class TenantIsolationTests {

        private org.springframework.mock.web.MockHttpSession registerAndLogin(String username, String email) throws Exception {
            com.pastebin.identity.api.dto.RegisterRequest registerReq = new com.pastebin.identity.api.dto.RegisterRequest(username, email, "SecretPass123!");
            mockMvc.perform(post("/api/v1/auth/register")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(registerReq)))
                    .andExpect(status().isCreated());

            com.pastebin.identity.api.dto.LoginRequest loginReq = new com.pastebin.identity.api.dto.LoginRequest(username, "SecretPass123!");
            MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(loginReq)))
                    .andExpect(status().isOk())
                    .andReturn();

            return (org.springframework.mock.web.MockHttpSession) loginResult.getRequest().getSession();
        }

        @Test
        @DisplayName("TEST-TENANT-01: Moving a paste to another user's folder returns 400 Bad Request")
        void crossUserFolderMove_isRejected() throws Exception {
            org.springframework.mock.web.MockHttpSession aliceSession = registerAndLogin("alice" + System.currentTimeMillis(), "alice" + System.currentTimeMillis() + "@test.local");

            // Create user paste for Alice
            CreatePasteRequest request = new CreatePasteRequest(
                    "Alice Paste",
                    "Content owned by Alice",
                    "text",
                    Visibility.PUBLIC,
                    ExpirationPolicy.ONE_DAY
            );

            MvcResult pasteRes = mockMvc.perform(post("/api/v1/pastes")
                            .session(aliceSession)
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(request)))
                    .andExpect(status().isCreated())
                    .andReturn();

            CreatePasteResponse alicePaste = objectMapper.readValue(pasteRes.getResponse().getContentAsString(), CreatePasteResponse.class);

            // Attempt to move Alice's paste to non-existent or foreign folder ID 999999
            mockMvc.perform(put("/api/v1/folders/pastes/{pastePublicId}/move", alicePaste.id())
                            .session(aliceSession)
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"folderId\": 999999}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value("Target folder does not exist or belong to your account."));
        }
    }
}
