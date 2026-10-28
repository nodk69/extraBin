package com.pastebin.discovery.application;

/** Shared discovery feed limit, including the compile-time default for request annotations. */
public final class DiscoveryPagination {
    public static final int PAGE_SIZE = 8;
    public static final String DEFAULT_PAGE_SIZE = "8";

    private DiscoveryPagination() {
    }

    public static int clampSize(int size) {
        return Math.min(Math.max(1, size), PAGE_SIZE);
    }
}
