package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.PasswordResetRequest;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 7 regression tests for rate-limit identity forging (audit findings P1-01, P1-03).
 *
 * Contract under test: a caller must not be able to obtain a fresh rate-limit bucket by
 * rotating an attacker-supplied X-Forwarded-For value on every request.
 *
 * Written to the DESIRED security contract: the `spoofedXff...` tests are expected to FAIL
 * before the P1-01/P1-03 fix and PASS afterwards. The control test must pass at all times.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RateLimitSpoofedIpRegressionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RateLimiterService rateLimiterService;

    @BeforeEach
    void resetRateLimits() {
        rateLimiterService.clear();
    }

    /**
     * Control: with no spoofable headers, repeated failed logins from one client must trip the
     * login limiter (10 per 60 s) — the 11th attempt is 429. Must pass before AND after the fix.
     */
    @Test
    void unspoofedRepeatedLoginsAreRateLimited() throws Exception {
        for (int i = 1; i <= 10; i++) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(new LoginRequest("ghost-user", "WrongPass1!"))))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("ghost-user", "WrongPass1!"))))
                .andExpect(status().isTooManyRequests());
    }

    /**
     * P1-01: rotating a client-supplied X-Forwarded-For on every request must NOT defeat the
     * limiter. The peer (127.0.0.1 in MockMvc) is trusted, but without the trusted proxy's
     * authoritative header (X-Real-IP) the limiter must bucket ALL of these requests together.
     */
    @Test
    void spoofedXffRotationCannotDefeatLoginRateLimit() throws Exception {
        for (int i = 1; i <= 10; i++) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .with(csrf())
                            .header("X-Forwarded-For", "10." + i + "." + i + "." + i)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(new LoginRequest("ghost-user", "WrongPass1!"))))
                    .andExpect(status().isUnauthorized());
        }
        // 11th request, even with yet another forged XFF, must be limited like the control.
        mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .header("X-Forwarded-For", "77.13.55.90")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("ghost-user", "WrongPass1!"))))
                .andExpect(status().isTooManyRequests());
    }

    /**
     * P1-03: `/api/v1/auth/password-reset/request` keyed its limiter on raw
     * request.getRemoteAddr() — which, behind ForwardedHeaderFilter, is the attacker-controlled
     * XFF[0] — bypassing the shared resolution. It must use the hardened resolver instead.
     */
    @Test
    void spoofedXffRotationCannotDefeatPasswordResetRateLimit() throws Exception {
        for (int i = 1; i <= 5; i++) {
            mockMvc.perform(post("/api/v1/auth/password-reset/request")
                            .with(csrf())
                            .header("X-Forwarded-For", "10." + i + ".0." + i)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(new PasswordResetRequest("ghost@example.com"))))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(post("/api/v1/auth/password-reset/request")
                        .with(csrf())
                        .header("X-Forwarded-For", "88.44.22.11")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new PasswordResetRequest("ghost@example.com"))))
                .andExpect(status().isTooManyRequests());
    }
}
