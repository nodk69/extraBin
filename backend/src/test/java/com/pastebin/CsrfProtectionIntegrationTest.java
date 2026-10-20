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

/**
 * The SPA double-submit CSRF flow is verified on a freshly built context on purpose.
 *
 * <p>spring-security-test's {@code csrf()} post-processor mutates the <em>shared</em>
 * {@code CsrfFilter} bean of the application context: it reflectively replaces the
 * production {@code CookieCsrfTokenRepository} with a session-backed
 * {@code TestCsrfTokenRepository} (see
 * {@code SecurityMockMvcRequestPostProcessors$CsrfRequestPostProcessor}). Once any other
 * test class in the same JVM has used {@code .with(csrf())}, the context stops emitting
 * the {@code XSRF-TOKEN} cookie and this browser flow can no longer be observed. The
 * production behaviour itself is unaffected: with a pristine context the GET sets the
 * cookie and the echoed header authorises the mutation.
 *
 * <p>{@code classMode = BEFORE_CLASS} therefore gives this class its own context whose
 * CSRF filter still uses the production cookie repository, which makes the test
 * independent of the class execution order.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@org.springframework.test.annotation.DirtiesContext(
        classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.BEFORE_CLASS)
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
