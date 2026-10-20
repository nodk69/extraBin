package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteStar;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PasteStarRepository extends JpaRepository<PasteStar, Long> {

    @Query("SELECT ps FROM PasteStar ps WHERE ps.paste.id = :pasteId AND ps.userId = :userId")
    Optional<PasteStar> findByPasteIdAndUserId(@Param("pasteId") Long pasteId, @Param("userId") Long userId);

    @Query("SELECT ps FROM PasteStar ps WHERE ps.userId = :userId")
    List<PasteStar> findByUserId(@Param("userId") Long userId);

    boolean existsByPasteIdAndUserId(Long pasteId, Long userId);
}
