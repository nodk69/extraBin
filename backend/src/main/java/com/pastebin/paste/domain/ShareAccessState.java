package com.pastebin.paste.domain;

/**
 * Represents the access-control state for unlisted sharing links.
 */
public enum ShareAccessState {
    /**
     * Non-unlisted pastes (PUBLIC or PRIVATE) have no unlisted sharing token state.
     */
    NOT_APPLICABLE,

    /**
     * Legacy unlisted pastes created prior to the V12 tokenization migration.
     * Retain backward-compatible tokenless access.
     */
    LEGACY_OPEN,

    /**
     * Modern unlisted paste with an active, cryptographically secure share token hash.
     * Requires the corresponding share token for shared content retrieval.
     */
    ACTIVE,

    /**
     * Unlisted paste whose sharing link has been revoked by an authorized owner.
     * Denies all shared content retrieval (returns 404 Not Found to prevent oracle leaks).
     */
    REVOKED
}
