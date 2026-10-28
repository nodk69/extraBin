package com.pastebin.paste.infrastructure;

import com.pastebin.discovery.application.TrendingPolicy;
import com.pastebin.paste.domain.ActivityEventType;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;

public class TrendingRankingRepositoryImpl implements TrendingRankingRepository {
    private final EntityManager entityManager;
    private final TrendingPolicy policy;

    public TrendingRankingRepositoryImpl(EntityManager entityManager, TrendingPolicy policy) {
        this.entityManager = entityManager;
        this.policy = policy;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<Object[]> findTrendingPasteIdsAndScores(Instant now, Instant windowStart, String language, Pageable pageable) {
        var query = entityManager.createNativeQuery(TrendingQueries.RANKED)
                .setParameter("now", now).setParameter("windowStart", windowStart)
                .setParameter("language", language)
                .setParameter("viewWeight", policy.weight(ActivityEventType.VIEW))
                .setParameter("upvoteWeight", policy.weight(ActivityEventType.UPVOTE))
                .setParameter("starWeight", policy.weight(ActivityEventType.STAR))
                .setParameter("commentWeight", policy.weight(ActivityEventType.COMMENT))
                .setParameter("replyWeight", policy.weight(ActivityEventType.REPLY))
                .setParameter("halfLife", policy.halfLifeSeconds(Duration.between(windowStart, now)))
                .setParameter("anonymousCap", policy.anonymousCap())
                .setParameter("authorCap", policy.authorCap())
                .setParameter("explorationSlots", policy.explorationSlots())
                .setParameter("explorationStart", now.minus(Duration.ofHours(24)))
                .setParameter("firstPageSlots", com.pastebin.discovery.application.DiscoveryPagination.PAGE_SIZE - policy.explorationSlots());
        query.setFirstResult(Math.toIntExact(pageable.getOffset()));
        query.setMaxResults(pageable.getPageSize());
        return query.getResultList();
    }
}
