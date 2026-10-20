package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.RegisterRequest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext
class CsrfProtectionIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void stateChangingRequest_withoutCsrfToken_isRejectedWith403() throws Exception {
        RegisterRequest request = new RegisterRequest("csrfless", "csrfless@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden());
    }

    @Test
    void browserFlow_getSetsXsrfCookie_andEchoedHeaderAllowsMutation() throws Exception {
        // 1. Any first GET forces the XSRF-TOKEN cookie via CsrfCookieFilter
        MvcResult getResult = mockMvc.perform(get("/api/v1/discovery"))
                .andExpect(status().isOk())
                .andReturn();

        Cookie xsrfCookie = getResult.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrfCookie).isNotNull();
        assertThat(xsrfCookie.getValue()).isNotBlank();

        // 2. A mutation carrying BOTH the cookie (double-submit) and the echoed header is accepted
        RegisterRequest request = new RegisterRequest("csrfflow", "csrfflow@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .cookie(xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("csrfflow"));

        // 3. A mutation with a WRONG header token value is rejected
        RegisterRequest wrongToken = new RegisterRequest("csrfbad", "csrfbad@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .cookie(xsrfCookie)
                        .header("X-XSRF-TOKEN", "definitely-not-the-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wrongToken)))
                .andExpect(status().isForbidden());
    }
}
