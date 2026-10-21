package com.pastebin;

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
import org.springframework.test.web.servlet.ResultMatcher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 2 test suite for SecurityConfig authorization hardening.
 *
 * Tests URL-level authorization rules only. Uses non-existent resource IDs;
 * service-layer errors (404, 400) are expected and acceptable — they prove
 * the security filter chain allowed the request through.
 *
 * Expected RED tests against current code (pre-hardening):
 * <ul>
 *   <li>T24: GET /api/v1/pastes/starred anonymous → expects 401, currently permitAll</li>
 *   <li>T29: GET /actuator/prometheus anonymous → expects 401, currently permitAll</li>
 *   <li>T31: GET /actuator/prometheus ROLE_USER → expects 403, currently permitAll</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("SecurityConfig Authorization Hardening")
class SecurityAuthorizationHardeningTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private com.pastebin.identity.infrastructure.UserRepository userRepository;

    private static final String FAKE_PASTE = "nonExistentPasteXyz";
    private static final String FAKE_COMMENT = "99999";
    private static final String FAKE_REPLY = "88888";
    private static final String FAKE_USER = "nonexistentuser";

    /**
     * Asserts the response was NOT blocked by URL-level security (not 401/403).
     * Any other status (200, 400, 404, 415, 500) proves the security filter
     * chain permitted the request.
     */
    private static ResultMatcher urlAuthorizationPermitted() {
        return result -> {
            int s = result.getResponse().getStatus();
            assertThat(s)
                    .as("Expected URL-level security to permit this request (got %d)", s)
                    .isNotIn(401, 403);
        };
    }

    // ─── Public Paste Read Routes ───────────────────────────────

    @Nested
    @DisplayName("Public paste read operations (anonymous)")
    class PublicPasteReads {

        @Test // T01
        @DisplayName("T01: GET /api/v1/pastes/{id} — anonymous — not blocked")
        void publicReadPaste_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T04
        @DisplayName("T04: GET /api/v1/pastes/{id}/raw — anonymous — not blocked")
        void publicRawContent_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/raw"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T05
        @DisplayName("T05: GET /api/v1/pastes/{id}/download — anonymous — not blocked")
        void publicDownload_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/download"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T06
        @DisplayName("T06: GET /api/v1/pastes/{id}/download-zip — anonymous — not blocked")
        void publicDownloadZip_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/download-zip"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T07
        @DisplayName("T07: GET /api/v1/pastes/{id}/files/{f}/raw — anonymous — not blocked")
        void publicFileRaw_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/files/main.py/raw"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T08
        @DisplayName("T08: GET /api/v1/pastes/{id}/embed — anonymous — not blocked")
        void publicEmbed_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/embed"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T09
        @DisplayName("T09: GET /api/v1/pastes/{id}/share — anonymous — not blocked")
        void publicShare_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/share"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T11
        @DisplayName("T11: GET /api/v1/pastes/{id}.json — anonymous — not blocked")
        void publicTypedPaste_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + ".json"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T12
        @DisplayName("T12: GET /p/{id} — anonymous — not blocked")
        void publicMetadataHtml_noAuth() throws Exception {
            mockMvc.perform(get("/p/" + FAKE_PASTE))
                    .andExpect(urlAuthorizationPermitted());
        }
    }

    // ─── Public Paste Create Routes ─────────────────────────────

    @Nested
    @DisplayName("Public paste creation (anonymous)")
    class PublicPasteCreation {

        @Test // T02
        @DisplayName("T02: POST /api/v1/pastes — anonymous — not blocked")
        void publicCreatePaste_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T03
        @DisplayName("T03: POST /api/v1/pastes/encrypted — anonymous — not blocked")
        void publicCreateEncrypted_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/encrypted")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(urlAuthorizationPermitted());
        }
    }

    // ─── Public Paste Actions ───────────────────────────────────

    @Nested
    @DisplayName("Public paste actions (anonymous)")
    class PublicPasteActions {

        @Test // T10
        @DisplayName("T10: POST /api/v1/pastes/{id}/unlock — anonymous — not blocked")
        void publicUnlock_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/unlock")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T17
        @DisplayName("T17: POST /api/v1/pastes/{id}/vote — anonymous — not blocked")
        void publicPasteVote_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/vote")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"direction\":\"UP\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T18
        @DisplayName("T18: POST /api/v1/pastes/{id}/star — anonymous — 401 (service requires auth)")
        void publicPasteStar_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/star")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T22
        @DisplayName("T22: POST /api/v1/pastes/{id}/delete-anonymous — anonymous+cap — not blocked")
        void anonymousDeletePaste_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/delete-anonymous")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"deletionCapability\":\"fake-cap\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T23
        @DisplayName("T23: PATCH /api/v1/pastes/{id}/slug — anonymous+cap — not blocked")
        void slugUpdate_noAuth() throws Exception {
            mockMvc.perform(patch("/api/v1/pastes/" + FAKE_PASTE + "/slug")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"newSlug\":\"test-slug\",\"deletionCapability\":\"fake-cap\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }
    }

    // ─── Public Comments ────────────────────────────────────────

    @Nested
    @DisplayName("Public comment operations (anonymous)")
    class PublicComments {

        @Test // T13
        @DisplayName("T13: GET /api/v1/pastes/{id}/comments — anonymous — not blocked")
        void publicComments_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/comments"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T14
        @DisplayName("T14: POST /api/v1/pastes/{id}/comments — anonymous — not blocked")
        void publicPostComment_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/comments")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"test comment\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T19
        @DisplayName("T19: POST /api/v1/pastes/{id}/comments/{cid}/vote — anonymous — not blocked")
        void publicCommentVote_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/comments/" + FAKE_COMMENT + "/vote")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"direction\":\"UP\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }
    }

    // ─── Public Replies ─────────────────────────────────────────

    @Nested
    @DisplayName("Public reply operations (anonymous)")
    class PublicReplies {

        @Test // T15
        @DisplayName("T15: GET /api/v1/pastes/{id}/replies — anonymous — not blocked")
        void publicReplies_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/replies"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T16
        @DisplayName("T16: POST /api/v1/pastes/{id}/replies — anonymous — 401 (service requires auth)")
        void publicCreateReply_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/replies")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"test reply\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T20
        @DisplayName("T20: POST /api/v1/pastes/{pid}/replies/{rid}/vote — anonymous — not blocked")
        void publicReplyVote_noAuth() throws Exception {
            mockMvc.perform(post("/api/v1/pastes/" + FAKE_PASTE + "/replies/" + FAKE_REPLY + "/vote")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"direction\":\"UP\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T21
        @DisplayName("T21: POST /api/pastes/{pid}/replies/{rid}/vote — anonymous — legacy alias not blocked")
        void publicReplyVoteLegacy_noAuth() throws Exception {
            mockMvc.perform(post("/api/pastes/" + FAKE_PASTE + "/replies/" + FAKE_REPLY + "/vote")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"direction\":\"UP\"}"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T35
        @DisplayName("T35: PATCH /api/v1/replies/{id} — anonymous — 401 (service requires auth)")
        void replyEdit_noAuth_urlPermitted() throws Exception {
            mockMvc.perform(patch("/api/v1/replies/" + FAKE_REPLY)
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"edited\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T36
        @DisplayName("T36: DELETE /api/v1/replies/{id} — anonymous — 401 (service requires auth)")
        void replyDelete_noAuth_urlPermitted() throws Exception {
            mockMvc.perform(delete("/api/v1/replies/" + FAKE_REPLY)
                            .with(csrf()))
                    .andExpect(status().isUnauthorized());
        }
    }

    // ─── Public Discovery & Auth ────────────────────────────────

    @Nested
    @DisplayName("Public discovery and infrastructure routes (anonymous)")
    class PublicDiscoveryAndInfra {

        @Test // T33
        @DisplayName("T33: GET /api/v1/discovery — anonymous — not blocked")
        void publicDiscovery_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/discovery"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T34
        @DisplayName("T34: GET /api/v1/discovery/authors/{u} — anonymous — not blocked")
        void publicAuthorProfile_noAuth() throws Exception {
            mockMvc.perform(get("/api/v1/discovery/authors/" + FAKE_USER))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test
        @DisplayName("GET /actuator/health — anonymous — 200")
        void healthCheck_noAuth_200() throws Exception {
            mockMvc.perform(get("/actuator/health"))
                    .andExpect(status().isOk());
        }
    }

    // ─── Authentication-Required: Personal Data ─────────────────

    @Nested
    @DisplayName("Routes requiring authentication — personal data")
    class AuthRequiredPersonalData {

        @Test // T24 — EXPECTED RED
        @DisplayName("T24: GET /api/v1/pastes/starred — anonymous — expects 401 [RED: currently permitAll]")
        void starredPastes_noAuth_401() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/starred"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T25
        @DisplayName("T25: GET /api/v1/pastes/starred — authenticated — not blocked")
        void starredPastes_auth_notBlocked() throws Exception {
            com.pastebin.identity.domain.User user = userRepository.findByUsername("starred_test_user")
                    .orElseGet(() -> userRepository.save(new com.pastebin.identity.domain.User(
                            "starred_test_user", "starred_test@pastebin.local", "hash", "ROLE_USER"
                    )));
            com.pastebin.identity.infrastructure.PastebinUserPrincipal principal =
                    new com.pastebin.identity.infrastructure.PastebinUserPrincipal(user);

            mockMvc.perform(get("/api/v1/pastes/starred")
                            .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(principal)))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T26
        @DisplayName("T26: GET /api/v1/account/pastes — anonymous — 401")
        void accountPastes_noAuth_401() throws Exception {
            mockMvc.perform(get("/api/v1/account/pastes"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T27
        @DisplayName("T27: GET /api/v1/folders — anonymous — 401")
        void folders_noAuth_401() throws Exception {
            mockMvc.perform(get("/api/v1/folders"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T28
        @DisplayName("T28: GET /api/v1/notifications — anonymous — 401")
        void notifications_noAuth_401() throws Exception {
            mockMvc.perform(get("/api/v1/notifications"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T32
        @DisplayName("T32: GET /api/v1/pastes/{pid}/tags — anonymous — blocked by @PreAuthorize")
        void pasteTags_noAuth_blocked() throws Exception {
            mockMvc.perform(get("/api/v1/pastes/" + FAKE_PASTE + "/tags"))
                    .andExpect(result -> {
                        int s = result.getResponse().getStatus();
                        assertThat(s)
                                .as("Expected @PreAuthorize to block anonymous access (401 or 403)")
                                .isIn(401, 403);
                    });
        }
    }

    // ─── Authentication-Required: Prometheus ────────────────────

    @Nested
    @DisplayName("Prometheus metrics access control")
    class PrometheusAccessControl {

        @Test // T29 — EXPECTED RED
        @DisplayName("T29: GET /actuator/prometheus — anonymous — expects 401 [RED: currently permitAll]")
        void prometheus_noAuth_401() throws Exception {
            mockMvc.perform(get("/actuator/prometheus"))
                    .andExpect(status().isUnauthorized());
        }

        @Test // T30
        @DisplayName("T30: GET /actuator/prometheus — ROLE_ADMIN — not blocked")
        @WithMockUser(username = "admin", roles = "ADMIN")
        void prometheus_admin_notBlocked() throws Exception {
            mockMvc.perform(get("/actuator/prometheus"))
                    .andExpect(urlAuthorizationPermitted());
        }

        @Test // T31 — EXPECTED RED
        @DisplayName("T31: GET /actuator/prometheus — ROLE_USER — expects 403 [RED: currently permitAll]")
        @WithMockUser(username = "regularuser", roles = "USER")
        void prometheus_regularUser_403() throws Exception {
            mockMvc.perform(get("/actuator/prometheus"))
                    .andExpect(status().isForbidden());
        }
    }
}
