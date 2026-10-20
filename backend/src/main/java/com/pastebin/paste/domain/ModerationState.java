package com.pastebin.paste.domain;

/**
 * Moderation lifecycle state for content eligible for public discovery.
 * ACTIVE: content may appear on public discovery surfaces (subject to all other eligibility rules).
 * HIDDEN: content is excluded from every public surface; direct non-owner access is indistinguishable
 *         from a nonexistent paste. Owners retain access to their own hidden content.
 */
public enum ModerationState {
    ACTIVE,
    HIDDEN
}
