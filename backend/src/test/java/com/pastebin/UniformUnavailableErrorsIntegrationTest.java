package com.pastebin;

import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE tests for indistinguishable unavailable-resource responses.
 *
 * <p>Missing, expired, moderation-hidden, and no-password content-delivery requests must
 * return the same Problem Details contract. Only a supplied-but-wrong credential may
 * produce a distinguishable 401.</p>
 */
class UniformUnavailableErrorsIntegrationTest extends ShareTestSupport {

    private String problem(String body) throws Exception {
        var node = objectMapper.readTree(body);
        return node.get("status").asInt() + "|" + node.get("code").asText() + "|"
                + node.get("title").asText() + "|" + node.get("detail").asText();
    }

    private MvcResult raw(String id, String passwordHeader) throws Exception {
        var request = get("/api/v1/pastes/{id}/raw", id);
        if (passwordHeader != null) {
            request.header("X-Paste-Password", passwordHeader);
        }
        return mockMvc.perform(request).andReturn();
    }

    @Test
    void missingExpiredHiddenAndNoPasswordRaw_shareIdenticalProblemDetails() throws Exception {
        String expired = persistPaste("uniform_expired", "Expired", "gone",
                Visibility.PUBLIC, null, false, null, Instant.now().minusSeconds(60), null, null);
        String hidden = persistPaste("uniform_hidden", "Hidden", "hidden",
                Visibility.PUBLIC, null, false, ModerationState.HIDDEN, null, null, null);
        String password = persistPaste("uniform_password", "Password", "secret",
                Visibility.PUBLIC, "uniform-secret", false, null, null, null, null);

        MvcResult missingResult = raw("missing_uniform_9876", null);
        MvcResult expiredResult = raw(expired, null);
        MvcResult hiddenResult = raw(hidden, null);
        MvcResult passwordMissingResult = raw(password, null);

        assertThat(missingResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(expiredResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(hiddenResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(passwordMissingResult.getResponse().getStatus()).isEqualTo(404);

        String expected = problem(missingResult.getResponse().getContentAsString());
        assertThat(problem(expiredResult.getResponse().getContentAsString())).isEqualTo(expected);
        assertThat(problem(hiddenResult.getResponse().getContentAsString())).isEqualTo(expected);
        assertThat(problem(passwordMissingResult.getResponse().getContentAsString())).isEqualTo(expected);

        assertThat(expiredResult.getResponse().getContentType()).contains(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        assertThat(hiddenResult.getResponse().getContentType()).contains(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        assertThat(passwordMissingResult.getResponse().getContentType()).contains(MediaType.APPLICATION_PROBLEM_JSON_VALUE);

        assertThat(unavailableHeaders(expiredResult)).isEqualTo(unavailableHeaders(missingResult));
        assertThat(unavailableHeaders(hiddenResult)).isEqualTo(unavailableHeaders(missingResult));
        assertThat(unavailableHeaders(passwordMissingResult)).isEqualTo(unavailableHeaders(missingResult));
    }

    private java.util.Map<String, String> unavailableHeaders(MvcResult result) {
        java.util.Map<String, String> headers = new java.util.LinkedHashMap<>();
        headers.put(HttpHeaders.CACHE_CONTROL, result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL));
        headers.put(HttpHeaders.VARY, result.getResponse().getHeader(HttpHeaders.VARY));
        headers.put(HttpHeaders.CONTENT_TYPE, result.getResponse().getContentType());
        headers.put("X-Content-Type-Options", result.getResponse().getHeader("X-Content-Type-Options"));
        headers.put("X-Robots-Tag", result.getResponse().getHeader("X-Robots-Tag"));
        return headers;
    }

    @Test
    void wrongPassword_remainsDistinguishable401() throws Exception {
        String password = persistPaste("uniform_wrong", "Password", "secret",
                Visibility.PUBLIC, "uniform-secret", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", password)
                        .header("X-Paste-Password", "wrong"))
                .andExpect(status().isUnauthorized());
    }
}
