package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteViewHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface PasteViewHistoryRepository extends JpaRepository<PasteViewHistory, Long> {

    Optional<PasteViewHistory> findByUserIdAndPasteId(@Param("userId") Long userId, @Param("pasteId") Long pasteId);

    @Query("SELECT h FROM PasteViewHistory h JOIN FETCH h.paste p " +
           "WHERE h.userId = :userId AND (p.expiresAt IS NULL OR p.expiresAt > :now) " +
           "ORDER BY h.viewedAt DESC, h.id DESC")
    List<PasteViewHistory> findRecentByUserId(@Param("userId") Long userId, @Param("now") Instant now, Pageable pageable);

    List<PasteViewHistory> findByUserId(Long userId);
}
