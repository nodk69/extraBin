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
}
