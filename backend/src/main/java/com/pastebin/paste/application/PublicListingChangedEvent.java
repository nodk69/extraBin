package com.pastebin.paste.application;

/**
 * Published inside a transaction that changes what a public discovery listing may show
 * (visibility, deletion, slug or displayed metadata of a public paste).
 */
public record PublicListingChangedEvent() {
}
