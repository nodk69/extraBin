package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteVote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PasteVoteRepository extends JpaRepository<PasteVote, Long> {

    @Query("SELECT pv FROM PasteVote pv WHERE pv.paste.id = :pasteId AND pv.userId = :userId")
    Optional<PasteVote> findByPasteIdAndUserId(@Param("pasteId") Long pasteId, @Param("userId") Long userId);

    @Query("SELECT pv FROM PasteVote pv WHERE pv.paste.id = :pasteId AND pv.clientIpHash = :clientIpHash")
    Optional<PasteVote> findByPasteIdAndClientIpHash(@Param("pasteId") Long pasteId, @Param("clientIpHash") String clientIpHash);

    @Query("SELECT pv FROM PasteVote pv WHERE pv.userId = :userId")
    List<PasteVote> findByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM PasteVote pv WHERE pv.userId IS NULL")
    int deleteAllAnonymous();
}
