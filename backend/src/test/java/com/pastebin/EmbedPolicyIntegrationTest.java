package com.pastebin;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.ShareAccessState;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE tests for the embed eligibility policy. Ineligible embeds must be
 * indistinguishable from missing pastes (404), not 403 existence confirmations.
 */
class EmbedPolicyIntegrationTest extends ShareTestSupport {

    @Test
    void embed_unlisted_returns404() throws Exception {
        String id = persistUnlisted("embed_unlisted", "shr_" + "h".repeat(43), ShareAccessState.ACTIVE);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void embed_private_returns404() throws Exception {
        String id = persistPaste("embed_private", "Private embed", "private",
                Visibility.PRIVATE, null, false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void embed_passwordProtected_returns404() throws Exception {
        String id = persistPaste("embed_password", "Password embed", "secret",
                Visibility.PUBLIC, "embed-secret", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void embed_burnAfterReading_returns404() throws Exception {
        String id = createPasteViaApi("Burn embed", "burn body", Visibility.PUBLIC,
                ExpirationPolicy.BURN_AFTER_READING, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void embed_encrypted_returns404() throws Exception {
        String id = persistEncrypted("embed_encrypted");

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void embed_hidden_returns404() throws Exception {
        String id = persistPaste("embed_hidden", "Hidden embed", "hidden",
                Visibility.PUBLIC, null, false, ModerationState.HIDDEN, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void embed_expired_returns404() throws Exception {
        String id = persistPaste("embed_expired", "Expired embed", "gone",
                Visibility.PUBLIC, null, false, null, java.time.Instant.now().minusSeconds(60), null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void embed_publicEligible_returns200NoStore() throws Exception {
        String id = createMultiFilePasteViaApi("Eligible embed", List.of("index.ts"), List.of("embed body"),
                Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(jsonPath("$.publicId").value(id))
                .andExpect(jsonPath("$.title").value("Eligible embed"))
                .andExpect(jsonPath("$.files[0].filename").value("index.ts"));
    }

    @Test
    void embed_responseDoesNotLeakInternalMetadata() throws Exception {
        String id = createPasteViaApi("Embed leak check", "embed body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body)
                .doesNotContain("\"userId\"")
                .doesNotContain("\"passwordHash\"")
                .doesNotContain("\"shareTokenHash\"")
                .doesNotContain("\"deletionCapabilityHash\"")
                .doesNotContain("\"ciphertext\"")
                .doesNotContain("\"nonce\"")
                .doesNotContain("\"authTag\"");
    }
}
