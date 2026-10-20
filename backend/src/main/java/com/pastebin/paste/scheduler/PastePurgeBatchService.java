package com.pastebin.paste.scheduler;

import com.pastebin.paste.infrastructure.PasteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Dedicated Spring bean for managing isolated transaction boundaries during batch purging (SEC-04).
 * By executing each chunked batch in an isolated, independent transaction (Propagation.REQUIRES_NEW),
 * row and index locks are released immediately upon batch completion rather than spanning the entire loop.
 */
@Service
public class PastePurgeBatchService {

    private final PasteRepository pasteRepository;
    private final com.pastebin.identity.infrastructure.PasswordResetTokenRepository passwordResetTokenRepository;

    public PastePurgeBatchService(PasteRepository pasteRepository,
                                  com.pastebin.identity.infrastructure.PasswordResetTokenRepository passwordResetTokenRepository) {
        this.pasteRepository = pasteRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
    }

    /**
     * Purges a single batch of expired paste IDs within its own independent transaction boundary.
     * Guarantees that locks acquired on this batch are released on transaction commit.
     *
     * @param expiredIds list of IDs to delete
     * @return number of rows purged in this batch
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int purgeBatchInNewTransaction(List<Long> expiredIds) {
        if (expiredIds == null || expiredIds.isEmpty()) {
            return 0;
        }
        return pasteRepository.deletePastesByIds(expiredIds);
    }

    /**
     * Purges expired or consumed password reset tokens in an independent transaction.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int purgeExpiredTokensInNewTransaction(java.time.Instant now) {
        return passwordResetTokenRepository.deleteExpiredOrUsedTokens(now);
    }
}
