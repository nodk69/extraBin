package com.pastebin.paste.scheduler;

import com.pastebin.paste.infrastructure.PasteRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Scheduled background reaper that purges expired pastes from the database.
 * Emits operational metrics via Micrometer for Prometheus monitoring.
 */
@Component
public class ExpirationCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(ExpirationCleanupScheduler.class);

    private final PasteRepository pasteRepository;
    private final PastePurgeBatchService pastePurgeBatchService;
    private final Counter purgedCounter;
    private final int batchSize;
    private final java.util.concurrent.atomic.AtomicBoolean isRunning = new java.util.concurrent.atomic.AtomicBoolean(false);

    public ExpirationCleanupScheduler(PasteRepository pasteRepository,
                                      PastePurgeBatchService pastePurgeBatchService,
                                      MeterRegistry meterRegistry,
                                      @org.springframework.beans.factory.annotation.Value("${pastebin.cleanup.batch-size:500}") int batchSize) {
        this.pasteRepository = pasteRepository;
        this.pastePurgeBatchService = pastePurgeBatchService;
        this.purgedCounter = Counter.builder("pastes.expired.purged")
                .description("Total number of expired pastes purged by background cleanup")
                .register(meterRegistry);
        this.batchSize = batchSize;
    }

    /**
     * Periodic cleanup job configured via 'pastebin.cleanup.cron'.
     * Defaults to running every 5 minutes.
     */
    @Scheduled(cron = "${pastebin.cleanup.cron:0 */5 * * * *}")
    public void scheduleCleanup() {
        try {
            executeCleanup();
        } catch (Exception ex) {
            log.error("Error occurred during scheduled expired pastes cleanup: {}", ex.getMessage(), ex);
        }
    }

    /**
     * Executes the purge operation using chunked batches where each batch commits in an independent transaction.
     * Prevents unbounded table lock contention, database lock escalation, and cascading rollbacks.
     * Returns the total number of purged rows.
     */
    public int executeCleanup() {
        if (!isRunning.compareAndSet(false, true)) {
            log.warn("Expiration cleanup is already running; skipping overlapping execution.");
            return 0;
        }

        Instant now = Instant.now();
        int totalPurged = 0;

        try {
            while (true) {
                java.util.List<Long> expiredIds = pasteRepository.findExpiredPasteIds(
                        now,
                        org.springframework.data.domain.PageRequest.of(0, batchSize)
                );
                if (expiredIds.isEmpty()) {
                    break;
                }
                int purgedBatch = pastePurgeBatchService.purgeBatchInNewTransaction(expiredIds);
                totalPurged += purgedBatch;
                if (expiredIds.size() < batchSize) {
                    break;
                }
                // P1-18: a full batch that deleted 0 rows means those rows are locked by a
                // writer that will finish shortly. Looping immediately re-selects the same
                // locked ids in a tight spin. Stop this pass and let the next scheduled run
                // (or a transient-failure retry pick them up) make progress.
                if (purgedBatch == 0) {
                    log.warn("Expired-paste cleanup made no progress on a full batch ({} row(s) locked or delete blocked); deferring remaining rows to the next cycle.", expiredIds.size());
                    break;
                }
            }

            if (totalPurged > 0) {
                purgedCounter.increment(totalPurged);
                log.info("Purged {} expired paste(s) in batches of {} older than {}.", totalPurged, batchSize, now);
            } else {
                log.debug("Expired pastes cleanup executed at {}. No expired pastes found.", now);
            }

            try {
                int purgedTokens = pastePurgeBatchService.purgeExpiredTokensInNewTransaction(now);
                if (purgedTokens > 0) {
                    log.info("Purged {} expired or consumed password reset token(s).", purgedTokens);
                }
            } catch (Exception ex) {
                log.warn("Failed to reap expired password reset tokens: {}", ex.getMessage());
            }

            return totalPurged;
        } finally {
            isRunning.set(false);
        }
    }
}
