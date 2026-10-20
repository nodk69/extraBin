package com.pastebin;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE contract tests for POST /api/v1/pastes/{id}/unlock and the X-Paste-Unlock grant.
 */
class UnlockTokenIntegrationTest extends ShareTestSupport {

    private static final String PASSWORD = "correct-horse-battery";

    private String passwordPaste() {
        return persistPaste("unlock_pw", "Unlock fixture", "protected content",
                Visibility.PUBLIC, PASSWORD, false, null, null, null, null);
    }

    private String unlock(String id, String password, String realIp) throws Exception {
        var request = post("/api/v1/pastes/{id}/unlock", id)
                .with(csrf())
                .contentType(APPLICATION_JSON)
                .content("{\"password\":\"" + password + "\"}");
        if (realIp != null) {
            request.header("X-Real-IP", realIp);
        }
        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("unlockToken").asText();
    }

    @Test
    void unlock_withCorrectPassword_returnsTokenAndNoStore() throws Exception {
        String id = passwordPaste();

        MvcResult result = mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(jsonPath("$.unlockToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain(PASSWORD);
    }

    @Test
    void unlock_withWrongPassword_returns401() throws Exception {
        String id = passwordPaste();

        mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{\"password\":\"definitely-wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void unlock_withoutPassword_returnsUniform404() throws Exception {
        String id = passwordPaste();

        mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void unlock_missingPaste_returns404() throws Exception {
        mockMvc.perform(post("/api/v1/pastes/{id}/unlock", "does_not_exist_1234")
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void unlock_afterTenFailures_returns429WithRetryAfter() throws Exception {
        String id = passwordPaste();

        for (int attempt = 0; attempt < 10; attempt++) {
            mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                            .with(csrf())
                            .contentType(APPLICATION_JSON)
                            .content("{\"password\":\"wrong-" + attempt + "\"}"))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{\"password\":\"wrong-final\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void unlockToken_grantsViewRawDownloadAndZip() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, PASSWORD, null);

        mockMvc.perform(get("/api/v1/pastes/{id}", id).header("X-Paste-Unlock", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(false))
                .andExpect(jsonPath("$.content").value("protected content"));

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Unlock", token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/{id}/download", id).header("X-Paste-Unlock", token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id).header("X-Paste-Unlock", token))
                .andExpect(status().isOk());
    }

    @Test
    void unlockToken_tampered_returns401() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, PASSWORD, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Unlock", token + "x"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void unlockToken_boundToPaste_cannotAccessAnotherPaste() throws Exception {
        String first = passwordPaste();
        String second = passwordPaste();
        String token = unlock(first, PASSWORD, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", second).header("X-Paste-Unlock", token))
                .andExpect(status().isNotFound());
    }

    @Test
    void unlockToken_isAcceptedByTypedSuffixEndpoint() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, PASSWORD, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).header("X-Paste-Unlock", token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")));
    }

    @Test
    void unlockToken_corsPreflightAllowsTheUnlockHeader() throws Exception {
        String id = passwordPaste();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .options("/api/v1/pastes/{id}/raw", id)
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "X-Paste-Unlock"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                        containsString("X-Paste-Unlock")));
    }

    @Test
    void unlockToken_doesNotGrantAccessToUnlistedWithoutShareToken() throws Exception {
        String token = "shr_" + "d".repeat(43);
        String id = persistUnlisted("unlock_unl", token, com.pastebin.paste.domain.ShareAccessState.ACTIVE);
        // The unlisted paste is not password protected; an unlock token must not substitute for the share token.
        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Unlock", "v1.invalid.token"))
                .andExpect(status().isNotFound());
    }

    @Test
    void unlock_responseDoesNotEchoPassword() throws Exception {
        String id = passwordPaste();
        MvcResult result = mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain(PASSWORD);
        assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
    }
}
