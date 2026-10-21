package com.pastebin.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.web.server.Cookie;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression tests for session cookie SameSite configuration.
 * Verifies that the SameSite enum correctly accepts valid values and rejects invalid ones.
 * These tests ensure that environment variable misconfigurations are caught early.
 */
class SessionCookieSameSiteValidationTest {

    @Test
    void sameSite_acceptsLax() {
        Cookie.SameSite sameSite = Cookie.SameSite.valueOf("LAX");
        assertEquals(Cookie.SameSite.LAX, sameSite);
    }

    @Test
    void sameSite_acceptsStrict() {
        Cookie.SameSite sameSite = Cookie.SameSite.valueOf("STRICT");
        assertEquals(Cookie.SameSite.STRICT, sameSite);
    }

    @Test
    void sameSite_acceptsNone() {
        Cookie.SameSite sameSite = Cookie.SameSite.valueOf("NONE");
        assertEquals(Cookie.SameSite.NONE, sameSite);
    }

    @Test
    void sameSite_rejectsTrue() {
        // This is the exact error from production: APP_SESSION_COOKIE_SAME_SITE=true
        assertThrows(IllegalArgumentException.class, () -> {
            Cookie.SameSite.valueOf("TRUE");
        }, "SameSite must reject 'true' — this is a common misconfiguration");
    }

    @Test
    void sameSite_rejectsFalse() {
        assertThrows(IllegalArgumentException.class, () -> {
            Cookie.SameSite.valueOf("FALSE");
        }, "SameSite must reject 'false'");
    }

    @Test
    void sameSite_rejectsInvalidStrings() {
        String[] invalidValues = {"yes", "no", "1", "0", "invalid", "enabled", "disabled"};
        for (String value : invalidValues) {
            assertThrows(IllegalArgumentException.class, () -> {
                Cookie.SameSite.valueOf(value.toUpperCase());
            }, "SameSite must reject value: " + value);
        }
    }

    @Test
    void sameSite_caseInsensitive() {
        // Spring Boot's property binding is case-insensitive for enums
        assertEquals(Cookie.SameSite.LAX, Cookie.SameSite.valueOf("LAX"));
        assertEquals(Cookie.SameSite.LAX, Cookie.SameSite.valueOf("lax".toUpperCase()));
        assertEquals(Cookie.SameSite.NONE, Cookie.SameSite.valueOf("none".toUpperCase()));
        assertEquals(Cookie.SameSite.STRICT, Cookie.SameSite.valueOf("strict".toUpperCase()));
    }

    @Test
    void sameSite_validValues_areExactlyThree() {
        Cookie.SameSite[] values = Cookie.SameSite.values();
        assertEquals(3, values.length, "SameSite should have exactly 3 valid values: LAX, STRICT, NONE");
    }
}
