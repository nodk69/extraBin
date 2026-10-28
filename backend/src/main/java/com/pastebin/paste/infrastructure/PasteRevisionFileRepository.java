package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteRevisionFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PasteRevisionFileRepository extends JpaRepository<PasteRevisionFile, Long> {
    List<PasteRevisionFile> findByRevisionIdOrderBySortOrderAsc(Long revisionId);
}
