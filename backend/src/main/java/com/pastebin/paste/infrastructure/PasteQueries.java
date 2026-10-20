package com.pastebin.paste.infrastructure;

/**
 * Single source of truth for the public-discovery eligibility predicate.
 *
 * Every public discovery surface (feed, search, tag cloud, trending, most-saved, profile
 * listings, collection public items, public counts) must apply exactly this predicate so a
 * paste can never be visible on one surface and hidden on another. EligibilityConsistency
 * integration tests enforce this property.
 *
 * Owner access to their own content is a separate authorization decision and is NOT part
 * of this predicate.
 */
public final class PasteQueries {

    /**
     * JPQL predicate over alias {@code p} (Paste). Binds parameter {@code :now}.
     * Requires {@code moderationState} column (V16).
     */
    public static final String ELIGIBLE_PUBLIC_PREDICATE =
            "p.visibility = com.pastebin.paste.domain.Visibility.PUBLIC" +
            " AND (p.expiresAt IS NULL OR p.expiresAt > :now)" +
            " AND p.burnAfterReading = false" +
            " AND p.passwordHash IS NULL" +
            " AND p.encryptionMode IS NULL" +
            " AND p.moderationState = com.pastebin.paste.domain.ModerationState.ACTIVE";

    private PasteQueries() {
    }
}
