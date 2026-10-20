package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SupabaseSyncSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void sync_withInvalidAccessToken_isRejectedAndEstablishesNoSession() throws Exception {
        // A syntactically valid but unverifyable token must never yield a session,
        // regardless of the email supplied in the request body.
        Map<String, String> payload = Map.of(
                "accessToken", "garbage-token-not-issued-by-supabase",
                "email", "victim@example.com",
                "username", "victim"
        );

        mockMvc.perform(post("/api/v1/auth/supabase-sync")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sync_withMissingAccessToken_failsValidation() throws Exception {
        Map<String, String> payload = Map.of(
                "email", "victim@example.com",
                "username", "victim"
        );

        mockMvc.perform(post("/api/v1/auth/supabase-sync")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sync_withBlankAccessToken_failsValidation() throws Exception {
        Map<String, String> payload = Map.of(
                "accessToken", " ",
                "email", "victim@example.com",
                "username", "victim"
        );

        mockMvc.perform(post("/api/v1/auth/supabase-sync")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sync_doesNotProvisionClientSuppliedEmail() throws Exception {
        // Even after a rejected sync, the client-supplied email must not have been
        // provisioned as a verified local account.
        Map<String, String> payload = Map.of(
                "accessToken", "garbage-token-not-issued-by-supabase",
                "email", "never-should-exist@example.com",
                "username", "ghost"
        );

        mockMvc.perform(post("/api/v1/auth/supabase-sync")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isUnauthorized());

        // Login with the phantom account must fail.
        mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "usernameOrEmail", "never-should-exist@example.com",
                                "password", "whatever"))))
                .andExpect(status().isUnauthorized());
    }
}
