package com.pastebin.discovery.infrastructure.meilisearch;

import java.util.List;

public class MeilisearchSearchResult {
    private final List<String> hitPublicIds;
    private final long estimatedTotalHits;
    private final boolean degraded;

    public MeilisearchSearchResult(List<String> hitPublicIds, long estimatedTotalHits, boolean degraded) {
        this.hitPublicIds = hitPublicIds;
        this.estimatedTotalHits = estimatedTotalHits;
        this.degraded = degraded;
    }

    public List<String> getHitPublicIds() {
        return hitPublicIds;
    }

    public long getEstimatedTotalHits() {
        return estimatedTotalHits;
    }

    public boolean isDegraded() {
        return degraded;
    }
}
