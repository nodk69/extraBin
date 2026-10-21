package com.pastebin.config;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.DefaultCsrfToken;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Boots the real application with the exact legacy values that took production down
 * (a boolean instead of a SameSite enum name) and verifies it starts anyway.
 *
 * <p>Before {@link SameSiteCookieEnvironmentPostProcessor} existed, this context failed with
 * {@code No enum constant org.springframework.boot.web.server.Cookie.SameSite.true} and the
 * process exited with status 1.
 *
 * <p>The cookie assertions read the {@link Cookie} object the repository writes, because
 * {@code MockHttpServletResponse} serializes only {@code MockCookie} instances and silently
 * drops Servlet 6 cookie attributes; Tomcat does emit them (verified against the running
 * application in deployment checks).
 */
@SpringBootTest(properties = {
        "server.servlet.session.cookie.same-site=true",
        "pastebin.csrf.cookie-same-site=true"
})
@ActiveProfiles("test")
class LegacySameSiteBooleanStartupTest {

    @Autowired
    private Environment environment;

    @Autowired
    private CookieCsrfTokenRepository csrfTokenRepository;

    @Test
    void contextStartsWithLegacyBooleanSameSiteValues() {
        assertEquals("NONE", environment.getProperty("server.servlet.session.cookie.same-site"));
        assertEquals("None", environment.getProperty("pastebin.csrf.cookie-same-site"));
    }

    @Test
    void csrfCookieIsWrittenWithSameSiteNoneAndSecure() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        csrfTokenRepository.saveToken(
                new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "token-value"), request, response);

        Cookie cookie = response.getCookie("XSRF-TOKEN");
        assertNotNull(cookie, "XSRF-TOKEN cookie must be written");
        assertEquals("None", cookie.getAttribute("SameSite"),
                "cross-origin CSRF cookie must declare SameSite=None");
        assertTrue(cookie.getSecure(),
                "SameSite=None cookies are rejected by browsers without Secure");
    }
}
