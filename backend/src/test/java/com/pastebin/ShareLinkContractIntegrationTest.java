package com.pastebin;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.ShareAccessState;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE contract tests for GET /api/v1/pastes/{id}/share.
 * The endpoint does not exist yet, so the positive assertions fail with 404.
 */
class ShareLinkContractIntegrationTest extends ShareTestSupport {

    private static final String BASE = "https://share.example.test";

    @Test
    void shareDescriptor_publicPaste_returnsCanonicalUrlsFromConfiguredBase() throws Exception {
        String id = createPasteViaApi("Public share fixture", "hello world", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.canonicalUrl").value(BASE + "/p/" + id))
                .andExpect(jsonPath("$.rawUrl").value(BASE + "/api/v1/pastes/" + id + "/raw"))
                .andExpect(jsonPath("$.downloadUrl").value(BASE + "/api/v1/pastes/" + id + "/download"))
                .andExpect(jsonPath("$.zipDownloadUrl").value(BASE + "/api/v1/pastes/" + id + "/download-zip"))
                .andExpect(jsonPath("$.embedUrl").value(BASE + "/embed/" + id))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.shareStatus").value("NOT_APPLICABLE"))
                .andExpect(jsonPath("$.passwordRequired").value(false))
                .andExpect(jsonPath("$.ogEligible").value(true))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Share-Token")));
    }

    @Test
    void shareDescriptor_unlistedPaste_withoutToken_returnsUniform404() throws Exception {
        String token = "shr_" + "a".repeat(43);
        String id = persistUnlisted("share_unl_missing", token, ShareAccessState.ACTIVE);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void shareDescriptor_unlistedPaste_withValidToken_returnsTokenizedUrl() throws Exception {
        String token = "shr_" + "b".repeat(43);
        String id = persistUnlisted("share_unl_valid", token, ShareAccessState.ACTIVE);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id).param("token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canonicalUrl").value(containsString("token=" + token)))
                .andExpect(jsonPath("$.visibility").value("UNLISTED"))
                .andExpect(jsonPath("$.shareStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.ogEligible").value(false));
    }

    @Test
    void shareDescriptor_unlistedRevokedPaste_returns404() throws Exception {
        String id = persistUnlisted("share_unl_revoked", "shr_" + "c".repeat(43), ShareAccessState.REVOKED);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void shareDescriptor_privatePaste_nonOwner_returns404() throws Exception {
        String id = persistPaste("share_priv", "Private share fixture", "private content",
                Visibility.PRIVATE, null, false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void shareDescriptor_privatePaste_owner_returns200() throws Exception {
        MockHttpSession session = registerAndLogin();
        String id = createPasteViaApi("Owner private share", "owner only", Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY, null, session);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.canonicalUrl").value(BASE + "/p/" + id))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.ogEligible").value(false));
    }

    @Test
    void shareDescriptor_expiredPaste_returns404() throws Exception {
        String id = persistPaste("share_exp", "Expired share fixture", "gone",
                Visibility.PUBLIC, null, false, null, Instant.now().minus(1, ChronoUnit.MINUTES), null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void shareDescriptor_moderationHidden_nonOwner_returns404() throws Exception {
        String id = persistPaste("share_hidden", "Hidden share fixture", "hidden",
                Visibility.PUBLIC, null, false, ModerationState.HIDDEN, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void shareDescriptor_passwordPaste_withoutUnlock_returnsUniform404() throws Exception {
        String id = persistPaste("share_pw_missing", "Password share fixture", "secret",
                Visibility.PUBLIC, "correct-horse", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void shareDescriptor_passwordPaste_withWrongPassword_returns401() throws Exception {
        String id = persistPaste("share_pw_wrong", "Password share fixture", "secret",
                Visibility.PUBLIC, "correct-horse", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id).header("X-Paste-Password", "wrong-password"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void shareDescriptor_doesNotLeakInternalIdsOrHashes() throws Exception {
        String id = createPasteViaApi("Share leak check", "public body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body)
                .doesNotContain("\"userId\"")
                .doesNotContain("\"passwordHash\"")
                .doesNotContain("\"shareTokenHash\"")
                .doesNotContain("\"kdfSalt\"")
                .doesNotContain("\"wrappedKey\"")
                .doesNotContain("\"deletionCapabilityHash\"");
    }

    @Test
    void shareDescriptor_publicPaste_setsPrivateNoStore() throws Exception {
        String id = createPasteViaApi("Share cache fixture", "public body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("private")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Paste-Unlock")));
    }
}
