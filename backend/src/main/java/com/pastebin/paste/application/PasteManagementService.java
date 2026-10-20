package com.pastebin.paste.application;

import com.pastebin.paste.api.dto.EditPasteFileItemRequest;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.api.dto.PasteFileResponse;
import com.pastebin.paste.api.dto.PasteRevisionResponse;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.api.dto.PasteViewResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteFile;
import com.pastebin.paste.domain.PasteRevision;
import com.pastebin.paste.domain.ShareAccessState;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.infrastructure.PasteRevisionRepository;
import com.pastebin.shared.dto.PagedResponse;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ConflictException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.PayloadTooLargeException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@Service
public class PasteManagementService {

    private final PasteRepository pasteRepository;
    private final PasteRevisionRepository pasteRevisionRepository;

    private final jakarta.persistence.EntityManager entityManager;

    @Value("${pastebin.content.max-bytes:1048576}")
    private int maxContentBytes;

    public PasteManagementService(PasteRepository pasteRepository,
                                  PasteRevisionRepository pasteRevisionRepository,
                                  jakarta.persistence.EntityManager entityManager) {
        this.pasteRepository = pasteRepository;
        this.pasteRevisionRepository = pasteRevisionRepository;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getUserPastes(Long userId, Long folderId, Boolean unfiled, Pageable pageable) {
        Instant now = Instant.now();
        Page<Paste> page;
        if (Boolean.TRUE.equals(unfiled)) {
            page = pasteRepository.findActiveUserPastesUnfiled(userId, now, pageable);
        } else if (folderId != null) {
            page = pasteRepository.findActiveUserPastesByFolder(userId, folderId, now, pageable);
        } else {
            page = pasteRepository.findActiveUserPastes(userId, now, pageable);
        }

        List<PasteSummaryResponse> summaries = page.getContent().stream()
                .map(this::toSummaryResponse)
                .toList();

        return PagedResponse.of(summaries, page.getNumber(), page.getSize(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> searchUserPastes(Long userId, Long folderId, Boolean unfiled,
                                                                String search, String tagName, Pageable pageable) {
        Instant now = Instant.now();
        String normalizedSearch = (search != null && !search.isBlank()) ? search.trim() : null;
        String normalizedTag = (tagName != null && !tagName.isBlank()) ? tagName.trim().toLowerCase(java.util.Locale.ROOT) : null;
        boolean unfiledOnly = Boolean.TRUE.equals(unfiled);

        Page<Paste> page = pasteRepository.findUserLibraryPastes(
                userId, now, folderId, unfiledOnly, normalizedTag, normalizedSearch, pageable);

        List<PasteSummaryResponse> summaries = page.getContent().stream()
                .map(this::toSummaryResponse)
                .toList();

        return PagedResponse.of(summaries, page.getNumber(), page.getSize(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getUserPastes(Long userId, Pageable pageable) {
        return getUserPastes(userId, null, null, pageable);
    }

    @Transactional
    public PasteViewResponse editPaste(String publicId, Long userId, EditPasteRequest request) {
        Paste paste = pasteRepository.findActiveByPublicIdWithFilesForUpdate(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!userId.equals(paste.getUserId())) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        if (paste.isEncrypted()) {
            throw new BadRequestException("Encrypted pastes cannot be edited via the plaintext editor.");
        }

        // Optimistic concurrency control check
        if (!paste.getVersion().equals(request.version())) {
            throw new ConflictException(
                    "Concurrent modification detected. The paste was modified by another operation. Please reload before saving."
            );
        }

        // Acquire OPTIMISTIC_FORCE_INCREMENT so version is guaranteed to increment even if parent paste fields are unchanged
        entityManager.lock(paste, jakarta.persistence.LockModeType.OPTIMISTIC_FORCE_INCREMENT);
        paste.setLastEditedAt(Instant.now());

        List<EditPasteFileItemRequest> inputFiles = request.files();
        if (inputFiles == null) {
            // Omitted files payload: only permitted for single-file pastes for backwards compatibility
            if (paste.getFiles() != null && paste.getFiles().size() > 1) {
                throw new BadRequestException("Omitted 'files' cannot update a multi-file workspace. A complete files snapshot is required.");
            }
            if (request.content() == null || request.content().isBlank()) {
                throw new BadRequestException("Paste must contain content or at least one file.");
            }
            String derivedFilename = PasteService.deriveFilename(request.title(), request.language(), paste.getPublicId());
            Long existingId = (paste.getFiles() != null && !paste.getFiles().isEmpty()) ? paste.getFiles().get(0).getId() : null;
            inputFiles = List.of(new EditPasteFileItemRequest(existingId, derivedFilename, request.content(), request.language()));
        }

        if (inputFiles.isEmpty()) {
            throw new BadRequestException("Paste must contain at least one file.");
        }

        if (inputFiles.size() > PasteService.MAX_FILES_PER_PASTE) {
            throw new BadRequestException("A paste cannot contain more than " + PasteService.MAX_FILES_PER_PASTE + " files.");
        }

        // Map existing files by ID to verify ownership and update in-place
        Map<Long, PasteFile> existingFilesById = new HashMap<>();
        if (paste.getFiles() != null) {
            for (PasteFile pf : paste.getFiles()) {
                existingFilesById.put(pf.getId(), pf);
            }
        }

        Set<Long> seenIds = new HashSet<>();
        Set<String> seenFilenames = new HashSet<>();
        long totalBytes = 0;
        int totalLines = 0;

        // First pass: validate all input files before mutating entity
        for (int i = 0; i < inputFiles.size(); i++) {
            EditPasteFileItemRequest fileReq = inputFiles.get(i);
            if (fileReq.filename() == null || fileReq.filename().isBlank()) {
                throw new BadRequestException("File #" + (i + 1) + " must have a non-blank filename.");
            }

            String filename = java.text.Normalizer.normalize(fileReq.filename(), java.text.Normalizer.Form.NFC).trim();
            PasteService.validateFilenameSecurity(filename);

            if (!seenFilenames.add(filename.toLowerCase(Locale.ROOT))) {
                throw new BadRequestException("Duplicate filename in paste: " + filename);
            }

            if (fileReq.id() != null) {
                if (!seenIds.add(fileReq.id())) {
                    throw new BadRequestException("Duplicate file ID in snapshot: " + fileReq.id());
                }
                if (!existingFilesById.containsKey(fileReq.id())) {
                    throw new BadRequestException("File ID " + fileReq.id() + " does not belong to this paste.");
                }
            }

            if (fileReq.content() == null || fileReq.content().isBlank()) {
                throw new BadRequestException("File '" + filename + "' content must not be blank.");
            }

            byte[] fileBytes = fileReq.content().getBytes(StandardCharsets.UTF_8);
            if (fileBytes.length > maxContentBytes) {
                throw new PayloadTooLargeException("File '" + filename + "' exceeds maximum permitted limit of " + maxContentBytes + " bytes.");
            }

            totalBytes += fileBytes.length;
            totalLines += countLines(fileReq.content());
        }

        if (totalBytes > maxContentBytes) {
            throw new PayloadTooLargeException("Total updated content size (" + totalBytes + " bytes) exceeds limit of " + maxContentBytes + " bytes.");
        }

        // Store snapshot of current state as a revision
        PasteRevision revision = new PasteRevision(
                paste.getId(),
                paste.getVersion(),
                paste.getTitle(),
                paste.getContent(),
                paste.getLanguage()
        );
        pasteRevisionRepository.save(revision);

        // Apply modifications to paste metadata
        EditPasteFileItemRequest primaryReq = inputFiles.get(0);
        String primaryLang = PasteService.resolveLanguage(primaryReq.language(), primaryReq.filename().trim());
        paste.setTitle(request.title());
        paste.setContent(primaryReq.content());
        paste.setLanguage((request.language() == null || request.language().isBlank()) ? primaryLang : request.language().toLowerCase(Locale.ROOT));
        paste.setVisibility(request.visibility());
        if (request.visibility() == Visibility.UNLISTED) {
            if (paste.getShareAccessState() == ShareAccessState.NOT_APPLICABLE || paste.getShareTokenHash() == null) {
                String shareToken = com.pastebin.paste.domain.ShareTokenUtil.generateShareToken();
                paste.setShareAccessState(ShareAccessState.ACTIVE);
                paste.setShareTokenHash(com.pastebin.paste.domain.ShareTokenUtil.hashToken(shareToken));
            }
        } else {
            paste.setShareAccessState(ShareAccessState.NOT_APPLICABLE);
            paste.setShareTokenHash(null);
            paste.setLinkRevokedAt(null);
        }
        paste.setContentSizeBytes((int) totalBytes);
        paste.setLineCount(totalLines);
        paste.setUpdatedAt(Instant.now());

        // Update files snapshot in place, removing deleted files and adding new files
        // 1. Remove files not in snapshot (orphanRemoval will delete them from DB)
        if (paste.getFiles() != null) {
            boolean removedAny = paste.getFiles().removeIf(pf -> pf.getId() != null && !seenIds.contains(pf.getId()));
            if (removedAny) {
                pasteRepository.flush();
            }
        }

        // 2. Update existing files or append new files
        for (int i = 0; i < inputFiles.size(); i++) {
            EditPasteFileItemRequest fileReq = inputFiles.get(i);
            String filename = java.text.Normalizer.normalize(fileReq.filename(), java.text.Normalizer.Form.NFC).trim();
            String fileLang = PasteService.resolveLanguage(fileReq.language(), filename);

            if (fileReq.id() != null && existingFilesById.containsKey(fileReq.id())) {
                PasteFile existing = existingFilesById.get(fileReq.id());
                existing.setFilename(filename);
                existing.setContent(fileReq.content());
                existing.setLanguage(fileLang);
                existing.setSortOrder(i);
            } else {
                PasteFile newFile = new PasteFile(paste, filename, fileReq.content(), fileLang, i);
                paste.addFile(newFile);
            }
        }

        // Ensure in-memory collection reflects sort order
        if (paste.getFiles() != null) {
            paste.getFiles().sort(Comparator.comparingInt(PasteFile::getSortOrder));
        }

        Paste updated = pasteRepository.saveAndFlush(paste);

        List<PasteFileResponse> fileResponses = updated.getFiles().stream()
                .map(f -> new PasteFileResponse(
                        f.getId(),
                        f.getFilename(),
                        f.getContent(),
                        f.getLanguage(),
                        f.getContent().getBytes(StandardCharsets.UTF_8).length,
                        countLines(f.getContent()),
                        f.getSortOrder()
                ))
                .toList();

        return new PasteViewResponse(
                updated.getPublicId(),
                updated.getTitle(),
                updated.getContent(),
                updated.getLanguage(),
                updated.getVisibility(),
                updated.getContentSizeBytes(),
                updated.getLineCount(),
                true,
                updated.getCreatedAt(),
                updated.getUpdatedAt(),
                updated.getExpiresAt(),
                updated.getVersion(),
                updated.isBurnAfterReading(),
                updated.isBurnAfterReading(),
                updated.isPasswordProtected(),
                false,
                fileResponses,
                updated.getViews()
        );
    }

    @Transactional
    public void deleteOwnedPaste(String publicId, Long userId) {
        Paste paste = pasteRepository.findActiveByPublicId(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!userId.equals(paste.getUserId())) {
            throw new ResourceNotFoundException("Paste not found or has expired.");
        }

        pasteRevisionRepository.deleteByPasteId(paste.getId());
        pasteRepository.delete(paste);
    }

    @Transactional(readOnly = true)
    public List<PasteRevisionResponse> getPasteRevisions(String publicId, Long userId) {
        Paste paste = pasteRepository.findActiveByPublicId(publicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!userId.equals(paste.getUserId())) {
            throw new ForbiddenException("You do not have permission to view revisions for this paste.");
        }

        return pasteRevisionRepository.findByPasteIdOrderByVersionDesc(paste.getId()).stream()
                .map(r -> new PasteRevisionResponse(
                        r.getId(),
                        r.getVersion(),
                        r.getTitle(),
                        r.getContent(),
                        r.getLanguage(),
                        r.getCreatedAt()
                ))
                .toList();
    }

    private PasteSummaryResponse toSummaryResponse(Paste paste) {
        Long folderId = paste.getFolder() != null ? paste.getFolder().getId() : null;
        String folderName = paste.getFolder() != null ? paste.getFolder().getName() : null;
        return new PasteSummaryResponse(
                paste.getPublicId(),
                paste.getTitle(),
                paste.getLanguage(),
                paste.getVisibility(),
                paste.getContentSizeBytes(),
                paste.getLineCount(),
                paste.getCreatedAt(),
                paste.getExpiresAt(),
                paste.getVersion(),
                paste.getViews(),
                folderId,
                folderName
        );
    }

    private int countLines(String text) {
        if (text == null || text.isEmpty()) return 0;
        int lines = 1;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '\n') lines++;
        }
        return lines;
    }
}
