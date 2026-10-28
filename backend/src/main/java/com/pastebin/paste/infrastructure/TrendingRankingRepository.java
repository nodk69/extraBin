package com.pastebin.paste.infrastructure;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;

public interface TrendingRankingRepository {
    List<Object[]> findTrendingPasteIdsAndScores(Instant now, Instant windowStart, String language, Pageable pageable);
}
