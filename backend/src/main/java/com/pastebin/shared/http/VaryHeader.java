package com.pastebin.shared.http;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Writes the {@code Vary} header as a single consolidated value.
 *
 * <p>Spring's CORS processor records {@code Origin},
 * {@code Access-Control-Request-Method} and {@code Access-Control-Request-Headers} as
 * separate {@code Vary} entries before the handler runs. Appending the endpoint's
 * credential labels with {@code addHeader} therefore leaves them behind those entries,
 * where readers that inspect the first header value cannot see them. Consolidating keeps
 * the framework labels and makes the credential contract observable in one value.</p>
 */
public final class VaryHeader {

    /** Credential inputs that change the representation of a paste response. */
    public static final String CREDENTIALS =
            "X-Share-Token, X-Paste-Password, X-Paste-Unlock, Cookie";

    private VaryHeader() {
    }

    public static void write(HttpServletResponse response, String... labels) {
        Set<String> values = new LinkedHashSet<>();
        for (String existing : response.getHeaders(HttpHeaders.VARY)) {
            for (String part : existing.split(",")) {
                if (!part.isBlank()) {
                    values.add(part.trim());
                }
            }
        }
        for (String label : labels) {
            if (label != null && !label.isBlank()) {
                values.add(label.trim());
            }
        }
        response.setHeader(HttpHeaders.VARY, String.join(", ", values));
    }
}
