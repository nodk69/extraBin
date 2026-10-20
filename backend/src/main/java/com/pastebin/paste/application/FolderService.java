package com.pastebin.paste.application;

import com.pastebin.paste.api.dto.FolderOverviewResponse;
import com.pastebin.paste.api.dto.FolderResponse;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.Folder;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.infrastructure.FolderRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ConflictException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import com.pastebin.shared.errors.UnauthorizedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class FolderService {

    private final FolderRepository folderRepository;
    private final PasteRepository pasteRepository;

    public FolderService(FolderRepository folderRepository, PasteRepository pasteRepository) {
        this.folderRepository = folderRepository;
        this.pasteRepository = pasteRepository;
    }

    @Transactional
    public FolderResponse createFolder(Long userId, String name) {
        if (userId == null) {
            throw new UnauthorizedException("Authentication is required to create a folder.");
        }

        String cleanName = validateAndNormalizeFolderName(name);

        if (folderRepository.existsByUserIdAndNameIgnoreCase(userId, cleanName)) {
            throw new ConflictException("A folder named '" + cleanName + "' already exists.");
        }

        Folder folder = new Folder(userId, cleanName);
        Folder saved = folderRepository.save(folder);

        return new FolderResponse(saved.getId(), saved.getName(), 0, saved.getCreatedAt(), saved.getUpdatedAt());
    }

    @Transactional
    public FolderResponse renameFolder(Long userId, Long folderId, String newName) {
        if (userId == null) {
            throw new UnauthorizedException("Authentication is required to rename a folder.");
        }

        String cleanName = validateAndNormalizeFolderName(newName);

        Folder folder = folderRepository.findById(folderId)
                .filter(f -> f.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found."));

        if (!folder.getName().equalsIgnoreCase(cleanName)) {
            if (folderRepository.existsByUserIdAndNameIgnoreCase(userId, cleanName)) {
                throw new ConflictException("A folder named '" + cleanName + "' already exists.");
            }
            folder.setName(cleanName);
            folder = folderRepository.save(folder);
        }

        long count = folderRepository.countActivePastesByFolderId(folder.getId(), Instant.now());
        return new FolderResponse(folder.getId(), folder.getName(), count, folder.getCreatedAt(), folder.getUpdatedAt());
    }

    @Transactional
    public void deleteFolder(Long userId, Long folderId) {
        if (userId == null) {
            throw new UnauthorizedException("Authentication is required to delete a folder.");
        }

        Folder folder = folderRepository.findById(folderId)
                .filter(f -> f.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Folder not found."));

        // Orphan-handling policy: Move contained pastes to Unfiled rather than deleting them
        pasteRepository.disassociateFolder(folderId);

        folderRepository.delete(folder);
    }

    @Transactional(readOnly = true)
    public FolderOverviewResponse listFolders(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("Authentication is required to list folders.");
        }

        Instant now = Instant.now();
        List<Folder> folders = folderRepository.findAllByUserIdOrderByCreatedAtDesc(userId);

        List<FolderResponse> folderResponses = folders.stream().map(f -> {
            long count = folderRepository.countActivePastesByFolderId(f.getId(), now);
            return new FolderResponse(f.getId(), f.getName(), count, f.getCreatedAt(), f.getUpdatedAt());
        }).toList();

        long unfiledCount = folderRepository.countActiveUnfiledPastesByUserId(userId, now);
        long totalCount = folderResponses.stream().mapToLong(FolderResponse::pasteCount).sum() + unfiledCount;

        return new FolderOverviewResponse(folderResponses, unfiledCount, totalCount);
    }

    @Transactional
    public PasteSummaryResponse movePasteToFolder(Long userId, String pastePublicId, Long targetFolderId) {
        if (userId == null) {
            throw new UnauthorizedException("Authentication is required to move a paste.");
        }

        Paste paste = pasteRepository.findByPublicId(pastePublicId)
                .filter(p -> userId.equals(p.getUserId()))
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found."));

        Folder targetFolder = null;
        if (targetFolderId != null) {
            targetFolder = folderRepository.findById(targetFolderId)
                    .filter(f -> f.getUserId().equals(userId))
                    .orElseThrow(() -> new BadRequestException("Target folder does not exist or belong to your account."));
        }

        paste.setFolder(targetFolder);
        pasteRepository.save(paste);

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
                targetFolder != null ? targetFolder.getId() : null,
                targetFolder != null ? targetFolder.getName() : null
        );
    }

    public static String validateAndNormalizeFolderName(String name) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("Folder name cannot be blank.");
        }
        String clean = name.trim();
        if (clean.length() > 100) {
            throw new BadRequestException("Folder name cannot exceed 100 characters.");
        }
        for (char c : clean.toCharArray()) {
            if (c < 32 || c == 127) {
                throw new BadRequestException("Folder name contains invalid control characters.");
            }
        }
        return clean;
    }
}
