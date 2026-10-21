package com.pastebin.config;

import org.apache.commons.logging.Log;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.boot.logging.DeferredLogFactory;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Normalizes the two SameSite cookie properties before Spring Boot binds them.
 *
 * <p>Background: deployments previously used {@code APP_SESSION_COOKIE_SAME_SITE=true}
 * (and the CSRF equivalent) to mean "enable cross-site cookies". Spring Boot binds
 * {@code server.servlet.session.cookie.same-site} to {@code Cookie.SameSite}, an enum
 * of {@code LAX}/{@code STRICT}/{@code NONE}, so the literal {@code true} aborts startup
 * while the application context is still being prepared:
 *
 * <pre>
 * Failed to bind properties under 'server.servlet.session.cookie.same-site'
 * Reason: No enum constant org.springframework.boot.web.server.Cookie.SameSite.true
 * </pre>
 *
 * <p>That failure happens before any bean exists, so it cannot be handled by application
 * code. This post-processor runs after {@code application.yml} is loaded and rewrites the
 * legacy booleans to the only value they can plausibly have meant in a cross-origin
 * deployment — {@code true -> NONE} (cross-site allowed, requires {@code Secure}) and
 * {@code false -> LAX} (the default) — logging a warning so the misconfiguration is
 * still visible. Every genuinely invalid value (for example {@code yes}, {@code 1},
 * {@code enabled}) is rejected at startup with an actionable message naming the valid
 * values, instead of the opaque enum-conversion error above.
 *
 * <p>Valid values are canonicalized as well, so {@code none} and {@code NONE} both reach
 * {@link CsrfCookieFilter} as {@code None} — its {@code Secure} fallback compares the
 * value literally, and a lowercase value would have produced a {@code SameSite=None}
 * cookie without {@code Secure}, which browsers reject.
 */
public class SameSiteCookieEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String SESSION_SAME_SITE_PROPERTY = "server.servlet.session.cookie.same-site";
    static final String CSRF_SAME_SITE_PROPERTY = "pastebin.csrf.cookie-same-site";

    static final String SESSION_SAME_SITE_ENV_VAR = "APP_SESSION_COOKIE_SAME_SITE";
    static final String CSRF_SAME_SITE_ENV_VAR = "PASTEBIN_CSRF_COOKIE_SAME_SITE";

    /** Session cookie values are bound to an enum, so they are written in upper case. */
    static final String SESSION_CANONICAL_LAX = "LAX";
    static final String SESSION_CANONICAL_STRICT = "STRICT";
    static final String SESSION_CANONICAL_NONE = "NONE";

    /** CSRF cookie values are emitted into a header by {@link CsrfCookieFilter}. */
    static final String CSRF_CANONICAL_LAX = "Lax";
    static final String CSRF_CANONICAL_STRICT = "Strict";
    static final String CSRF_CANONICAL_NONE = "None";

    private static final String OVERRIDE_SOURCE_NAME = "sameSiteCookieNormalization";

    /** Deferred so the warning is replayed after the logging system is initialized. */
    private final Log log;

    public SameSiteCookieEnvironmentPostProcessor(DeferredLogFactory logFactory) {
        this.log = logFactory.getLog(SameSiteCookieEnvironmentPostProcessor.class);
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> overrides = new LinkedHashMap<>();
        normalize(
                environment,
                SESSION_SAME_SITE_PROPERTY,
                SESSION_SAME_SITE_ENV_VAR,
                SESSION_CANONICAL_LAX,
                SESSION_CANONICAL_STRICT,
                SESSION_CANONICAL_NONE,
                overrides
        );
        normalize(
                environment,
                CSRF_SAME_SITE_PROPERTY,
                CSRF_SAME_SITE_ENV_VAR,
                CSRF_CANONICAL_LAX,
                CSRF_CANONICAL_STRICT,
                CSRF_CANONICAL_NONE,
                overrides
        );
        if (!overrides.isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource(OVERRIDE_SOURCE_NAME, overrides));
        }
    }

    private void normalize(ConfigurableEnvironment environment,
                           String property,
                           String envVar,
                           String canonicalLax,
                           String canonicalStrict,
                           String canonicalNone,
                           Map<String, Object> overrides) {
        String raw = environment.getProperty(property);
        if (raw == null) {
            return;
        }
        String value = raw.trim();
        String canonical = resolveCanonical(value, canonicalLax, canonicalStrict, canonicalNone);
        if (canonical == null) {
            throw new IllegalStateException(
                    "Invalid value '" + value + "' for " + property + " (normally set through " + envVar + "). "
                            + "Valid values are LAX, STRICT or NONE"
                            + " (a cross-origin frontend/backend pair requires NONE with Secure cookies enabled)."
            );
        }
        if (isLegacyBoolean(value)) {
            log.warn("Property " + property + " was set to the legacy boolean '" + value + "' (via " + envVar + "); "
                    + "interpreting it as " + canonical + ". Set it to " + canonical + " to silence this warning.");
        }
        if (!canonical.equals(raw)) {
            overrides.put(property, canonical);
        }
    }

    private String resolveCanonical(String value,
                                    String canonicalLax,
                                    String canonicalStrict,
                                    String canonicalNone) {
        String normalized = value.toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "true", "none" -> canonicalNone;
            case "false", "lax" -> canonicalLax;
            case "strict" -> canonicalStrict;
            default -> null;
        };
    }

    private boolean isLegacyBoolean(String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        return "true".equals(normalized) || "false".equals(normalized);
    }

    @Override
    public int getOrder() {
        // Must run after ConfigDataEnvironmentPostProcessor has loaded application.yml,
        // but before any @ConfigurationProperties binding reads these values.
        return Ordered.LOWEST_PRECEDENCE;
    }
}
