package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PasteFileRepository extends JpaRepository<PasteFile, Long> {

    List<PasteFile> findByPasteIdOrderBySortOrderAsc(Long pasteId);

    Optional<PasteFile> findByPasteIdAndFilename(Long pasteId, String filename);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("DELETE FROM PasteFile pf WHERE pf.paste.id = :pasteId")
    int deleteByPasteId(@org.springframework.data.repository.query.Param("pasteId") Long pasteId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("DELETE FROM PasteFile pf WHERE pf.paste.id IN :pasteIds")
    int deleteByPasteIds(@org.springframework.data.repository.query.Param("pasteIds") java.util.Collection<Long> pasteIds);
}
