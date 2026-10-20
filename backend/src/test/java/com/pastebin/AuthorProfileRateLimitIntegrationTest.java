package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Public author endpoints are an enumeration/harvesting surface: they answer "does this
 * username exist?" and list a person's work. They reuse the existing bounded rate limiter
 * with a shared per-IP budget across both author routes.
 */
@SpringBootTest(properties = "app.discovery.profile-rate-limit-max=3")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthorProfileRateLimitIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RateLimiterService rateLimiterService;

    private String uid;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    @Test
    void authorProfileRequests_areRateLimitedPerIp() throws Exception {
        String username = "aprl" + uid;
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RegisterRequest(username, username + "@example.com", PASSWORD))))
                .andExpect(status().isCreated());
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession session = (MockHttpSession) login.getRequest().getSession();
        mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreatePasteRequest(
                                "Rate limited " + uid, "c", "java", Visibility.PUBLIC, ExpirationPolicy.NEVER))))
                .andExpect(status().isCreated());

        // Budget of three is shared across both author routes.
        mockMvc.perform(get("/api/v1/discovery/authors/" + username)).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/discovery/authors/" + username)).andExpect(status().isOk());

        MvcResult limited = mockMvc.perform(get("/api/v1/discovery/authors/" + username + "/pastes"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"))
                .andReturn();

        String retryAfter = limited.getResponse().getHeader("Retry-After");
        assertNotNull(retryAfter);
        assertFalse(retryAfter.isBlank());
        // Public discovery itself has a separate budget and must not be throttled by profile traffic.
        mockMvc.perform(get("/api/v1/discovery"))
                .andExpect(status().isOk());
    }
}
