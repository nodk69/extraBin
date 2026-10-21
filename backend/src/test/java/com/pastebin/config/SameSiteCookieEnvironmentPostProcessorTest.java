package com.pastebin.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.logging.DeferredLogs;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression tests for the startup normalization of the cookie SameSite properties.
 *
 * <p>The production outage this guards against: {@code APP_SESSION_COOKIE_SAME_SITE=true}
 * resolved {@code server.servlet.session.cookie.same-site} to {@code true}, which Spring Boot
 * cannot bind to {@code Cookie.SameSite}, and the application exited with status 1 before
 * the web server started.
 */
class SameSiteCookieEnvironmentPostProcessorTest {

    private final SameSiteCookieEnvironmentPostProcessor processor =
            new SameSiteCookieEnvironmentPostProcessor(new DeferredLogs());

    private MockEnvironment run(String sessionValue, String csrfValue) {
        MockEnvironment environment = new MockEnvironment();
        if (sessionValue != null) {
            environment.withProperty(SameSiteCookieEnvironmentPostProcessor.SESSION_SAME_SITE_PROPERTY, sessionValue);
        }
        if (csrfValue != null) {
            environment.withProperty(SameSiteCookieEnvironmentPostProcessor.CSRF_SAME_SITE_PROPERTY, csrfValue);
        }
        processor.postProcessEnvironment(environment, new SpringApplication());
        return environment;
    }

    @Test
    void legacySessionBooleanTrue_becomesNone() {
        MockEnvironment environment = run("true", null);

        assertEquals("NONE", environment.getProperty(SameSiteCookieEnvironmentPostProcessor.SESSION_SAME_SITE_PROPERTY));
    }

    @Test
    void legacyCsrfBooleanTrue_becomesNone() {
        MockEnvironment environment = run(null, "true");

        assertEquals("None", environment.getProperty(SameSiteCookieEnvironmentPostProcessor.CSRF_SAME_SITE_PROPERTY));
    }

    @Test
    void legacyBooleanFalse_becomesLax() {
        MockEnvironment environment = run("false", "false");

        assertEquals("LAX", environment.getProperty(SameSiteCookieEnvironmentPostProcessor.SESSION_SAME_SITE_PROPERTY));
        assertEquals("Lax", environment.getProperty(SameSiteCookieEnvironmentPostProcessor.CSRF_SAME_SITE_PROPERTY));
    }

    @Test
    void lowercaseCsrfNone_isCanonicalizedForSecureFallback() {
        MockEnvironment environment = run("none", "none");

        assertEquals("NONE", environment.getProperty(SameSiteCookieEnvironmentPostProcessor.SESSION_SAME_SITE_PROPERTY));
        // CsrfCookieFilter compares against "None" to decide whether to add Secure.
        assertEquals("None", environment.getProperty(SameSiteCookieEnvironmentPostProcessor.CSRF_SAME_SITE_PROPERTY));
    }

    @Test
    void validValues_areAcceptedCaseInsensitively() {
        assertEquals("STRICT", run("Strict", null)
                .getProperty(SameSiteCookieEnvironmentPostProcessor.SESSION_SAME_SITE_PROPERTY));
        assertEquals("Strict", run(null, "STRICT")
                .getProperty(SameSiteCookieEnvironmentPostProcessor.CSRF_SAME_SITE_PROPERTY));
        assertEquals("LAX", run(" lax ", null)
                .getProperty(SameSiteCookieEnvironmentPostProcessor.SESSION_SAME_SITE_PROPERTY));
    }

    @Test
    void invalidValue_failsFastWithActionableMessage() {
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> run("yes", null));

        assertTrue(error.getMessage().contains("server.servlet.session.cookie.same-site"));
        assertTrue(error.getMessage().contains("APP_SESSION_COOKIE_SAME_SITE"));
        assertTrue(error.getMessage().contains("LAX, STRICT or NONE"));
    }

    @Test
    void invalidCsrfValue_failsFast() {
        IllegalStateException error = assertThrows(IllegalStateException.class, () -> run(null, "1"));

        assertTrue(error.getMessage().contains("PASTEBIN_CSRF_COOKIE_SAME_SITE"));
    }

    @Test
    void absentProperties_areLeftToApplicationDefaults() {
        MockEnvironment environment = run(null, null);

        assertNull(environment.getPropertySources().get("sameSiteCookieNormalization"));
    }
}
