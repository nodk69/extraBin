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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * DISC-12: search rate limiting (separate context for property override).
 */
@SpringBootTest(properties = "app.discovery.search-rate-limit-max=3")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DiscoverySearchRateLimitIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private RateLimiterService rateLimiterService;
    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
    }

    @Test
    void DISC_12_searchRateLimited_with429() throws Exception {
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/v1/discovery?q=ratelimitprobe"))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/v1/discovery?q=ratelimitprobe"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
        // Plain feed (no q/tag) remains available after the search limit is hit
        mockMvc.perform(get("/api/v1/discovery"))
                .andExpect(status().isOk());
    }
}
