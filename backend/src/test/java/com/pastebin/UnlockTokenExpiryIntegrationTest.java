package com.pastebin;

import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE test for unlock-token expiry. Uses a one-second TTL so the test does not
 * depend on the token's internal encoding.
 */
@SpringBootTest(properties = {
        "pastebin.share.public-base-url=https://share.example.test",
        "pastebin.share.unlock-secret=phase2-test-unlock-secret-at-least-32-bytes",
        "pastebin.share.unlock-ttl-seconds=1",
        "pastebin.share.archive-max-entries=3",
        "pastebin.share.archive-max-bytes=4096",
        "pastebin.share.archive-max-output-bytes=2048"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UnlockTokenExpiryIntegrationTest extends ShareTestSupport {

    private static final String PASSWORD = "short-lived-password";

    @Test
    void unlockToken_expired_returns401() throws Exception {
        String id = persistPaste("unlock_expiry", "Expiry fixture", "protected",
                Visibility.PUBLIC, PASSWORD, false, null, null, null, null);

        MvcResult unlockResult = mockMvc.perform(post("/api/v1/pastes/{id}/unlock", id)
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andReturn();

        String token = objectMapper.readTree(unlockResult.getResponse().getContentAsString())
                .get("unlockToken").asText();

        Thread.sleep(2_100L);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Unlock", token))
                .andExpect(status().isUnauthorized());
    }
}
