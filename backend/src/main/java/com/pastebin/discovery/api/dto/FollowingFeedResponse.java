package com.pastebin.discovery.api.dto;

import com.pastebin.paste.api.dto.PasteSummaryResponse;
import java.util.List;

public record FollowingFeedResponse(
        List<PasteSummaryResponse> items,
        String nextCursor,
        boolean hasMore
) {
}
