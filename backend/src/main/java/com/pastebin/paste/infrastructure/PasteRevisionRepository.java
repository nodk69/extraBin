package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.PasteRevision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PasteRevisionRepository extends JpaRepository<PasteRevision, Long> {
    List<PasteRevision> findByPasteIdOrderByVersionDesc(Long pasteId);
    void deleteByPasteId(Long pasteId);
}
