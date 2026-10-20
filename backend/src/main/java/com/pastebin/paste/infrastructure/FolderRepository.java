package com.pastebin.paste.infrastructure;

import com.pastebin.paste.domain.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface FolderRepository extends JpaRepository<Folder, Long> {

    List<Folder> findAllByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<Folder> findByIdAndUserId(Long id, Long userId);

    Optional<Folder> findByUserIdAndNameIgnoreCase(Long userId, String name);

    boolean existsByUserIdAndNameIgnoreCase(Long userId, String name);

    @Query("SELECT COUNT(p) FROM Paste p WHERE p.folder.id = :folderId AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    long countActivePastesByFolderId(@Param("folderId") Long folderId, @Param("now") Instant now);

    @Query("SELECT COUNT(p) FROM Paste p WHERE p.userId = :userId AND p.folder IS NULL AND (p.expiresAt IS NULL OR p.expiresAt > :now)")
    long countActiveUnfiledPastesByUserId(@Param("userId") Long userId, @Param("now") Instant now);
}
