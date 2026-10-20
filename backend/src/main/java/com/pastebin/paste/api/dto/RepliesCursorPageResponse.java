package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record RepliesCursorPageResponse(
        List<ReplyResponse> items,
        @JsonProperty("next_cursor")
        Long nextCursor,
        @JsonProperty("has_more")
        boolean hasMore,
        @JsonProperty("total_count")
        long totalCount
) {
}
