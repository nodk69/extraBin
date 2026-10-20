package com.pastebin;

import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE tests for the unlock-token IP-binding contract.
 *
 * <p>The token is bound to the authoritative client IP resolved by ClientIpResolver:
 * a trusted proxy may supply X-Real-IP; an untrusted peer may not. IPv6 textual
 * representations of the same address must normalize to the same binding.</p>
 */
class UnlockTokenIpBindingIntegrationTest extends ShareTestSupport {

    private static final String PASSWORD = "ip-bound-password";

    private String passwordPaste() {
        return persistPaste("unlock_ip", "IP binding fixture", "protected",
                Visibility.PUBLIC, PASSWORD, false, null, null, null, null);
    }

    private String unlock(String id, String realIp, String remoteAddr) throws Exception {
        var request = post("/api/v1/pastes/{id}/unlock", id)
                .with(csrf())
                .contentType(APPLICATION_JSON)
                .content("{\"password\":\"" + PASSWORD + "\"}");
        if (realIp != null) {
            request.header("X-Real-IP", realIp);
        }
        if (remoteAddr != null) {
            request.remoteAddress(remoteAddr);
        }
        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("unlockToken").asText();
    }

    @Test
    void unlockToken_fromDifferentClientIp_isRejected() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, "203.0.113.10", null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)
                        .header("X-Paste-Unlock", token)
                        .header("X-Real-IP", "203.0.113.11"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unlockToken_fromSameClientIp_isAccepted() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, "203.0.113.10", null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)
                        .header("X-Paste-Unlock", token)
                        .header("X-Real-IP", "203.0.113.10"))
                .andExpect(status().isOk());
    }

    @Test
    void unlockToken_ipv6EquivalentAddresses_areNormalized() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, "2001:db8::1", null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)
                        .header("X-Paste-Unlock", token)
                        .header("X-Real-IP", "2001:0db8:0:0:0:0:0:1"))
                .andExpect(status().isOk());
    }

    @Test
    void unlockToken_untrustedPeerIgnoresSpoofedRealIp() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, "203.0.113.10", "198.51.100.5");

        // Same authentic peer, different attacker-controlled header values: identity must stay the peer.
        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)
                        .header("X-Paste-Unlock", token)
                        .header("X-Real-IP", "203.0.113.99")
                        .header("X-Forwarded-For", "203.0.113.98")
                        .remoteAddress("198.51.100.5"))
                .andExpect(status().isOk());
    }

    @Test
    void unlockToken_untrustedPeerCannotChooseAnotherBucketViaRealIp() throws Exception {
        String id = passwordPaste();
        String token = unlock(id, "203.0.113.10", "198.51.100.5");

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)
                        .header("X-Paste-Unlock", token)
                        .header("X-Real-IP", "203.0.113.10")
                        .remoteAddress("198.51.100.6"))
                .andExpect(status().isUnauthorized());
    }
}
