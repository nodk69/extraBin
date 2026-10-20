package com.pastebin;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.ShareAccessState;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpSession;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE tests for cache-policy consistency. Protected content must never be
 * shared-cacheable, and responses that vary by credential must say so.
 */
class CachePolicyIntegrationTest extends ShareTestSupport {

    @Test
    void typedSuffix_passwordProtectedPublic_isPrivateNoStore() throws Exception {
        String id = createPasteViaApi("Typed password fixture", "typed body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, "typed-secret", null);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).header("X-Paste-Password", "typed-secret"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("private")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Paste-Password")));
    }

    @Test
    void typedSuffix_public_isPublicMaxAge300() throws Exception {
        String id = createPasteViaApi("Typed public fixture", "typed body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("public")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("max-age=300")));
    }

    @Test
    void typedSuffix_unlisted_isPrivateNoCache() throws Exception {
        String token = "shr_" + "g".repeat(43);
        String id = persistUnlisted("cache_unlisted", token, ShareAccessState.ACTIVE);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).param("token", token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("private")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-cache")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Share-Token")));
    }

    @Test
    void typedSuffix_privateOwner_isPrivateNoStore() throws Exception {
        MockHttpSession session = registerAndLogin();
        String id = createPasteViaApi("Typed private fixture", "typed body", Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY, null, session);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).session(session))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("private")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")));
    }

    @Test
    void raw_publicPaste_variesOnEncoding() throws Exception {
        String id = createPasteViaApi("Raw vary fixture", "raw body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.VARY, containsString("Accept-Encoding")));
    }

    @Test
    void raw_protectedPaste_variesOnCredentialHeaders() throws Exception {
        String id = persistPaste("cache_raw_pw", "Protected raw vary", "secret", Visibility.PUBLIC,
                "cache-secret", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Password", "cache-secret"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Paste-Password")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Paste-Unlock")));
    }

    @Test
    void downloadZip_publicPaste_isNotSharedCacheable() throws Exception {
        String id = createPasteViaApi("Zip cache fixture", "zip body", Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("private")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")));
    }
}
