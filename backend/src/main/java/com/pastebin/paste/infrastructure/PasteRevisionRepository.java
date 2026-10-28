package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteRevision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PasteRevisionRepository extends JpaRepository<PasteRevision, Long> {
    List<PasteRevision> findByPasteIdOrderByVersionDesc(Long pasteId);

    @Query("SELECT DISTINCT r FROM PasteRevision r LEFT JOIN FETCH r.files WHERE r.pasteId = :pasteId ORDER BY r.version DESC")
    List<PasteRevision> findByPasteIdWithFilesOrderByVersionDesc(@Param("pasteId") Long pasteId);

    @Query("SELECT DISTINCT r FROM PasteRevision r LEFT JOIN FETCH r.files WHERE r.pasteId = :pasteId AND r.version = :version")
    java.util.Optional<PasteRevision> findByPasteIdAndVersionWithFiles(@Param("pasteId") Long pasteId, @Param("version") Long version);

    void deleteByPasteId(Long pasteId);
}
