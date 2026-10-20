package com.pastebin.paste.application;

import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.api.dto.TagResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteViewHistory;
import com.pastebin.paste.domain.Tag;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.infrastructure.PasteViewHistoryRepository;
import com.pastebin.paste.infrastructure.TagRepository;
import com.pastebin.shared.errors.BadRequestException;
import com.pastebin.shared.errors.ConflictException;
import com.pastebin.shared.errors.ForbiddenException;
import com.pastebin.shared.errors.ResourceNotFoundException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Service
public class LibraryService {

    public static final int MAX_TAGS_PER_PASTE = 10;
    public static final int MAX_TAG_NAME_LENGTH = 50;
    public static final int RECENT_ACTIVITY_LIMIT = 50;

    private final PasteRepository pasteRepository;
    private final TagRepository tagRepository;
    private final PasteViewHistoryRepository pasteViewHistoryRepository;

    public LibraryService(PasteRepository pasteRepository,
                          TagRepository tagRepository,
                          PasteViewHistoryRepository pasteViewHistoryRepository) {
        this.pasteRepository = pasteRepository;
        this.tagRepository = tagRepository;
        this.pasteViewHistoryRepository = pasteViewHistoryRepository;
    }

    // =========================================================================
    // Tags
    // =========================================================================

    @Transactional
    public TagResponse addTagToPaste(String pastePublicId, Long userId, String rawName) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        String normalized = normalizeTagName(rawName);
        if (normalized.isEmpty()) {
            throw new BadRequestException("Tag name must not be empty.");
        }
        if (normalized.length() > MAX_TAG_NAME_LENGTH) {
            throw new BadRequestException("Tag name must not exceed " + MAX_TAG_NAME_LENGTH + " characters.");
        }

        Paste paste = pasteRepository.findActiveByPublicId(pastePublicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!userId.equals(paste.getUserId())) {
            throw new ForbiddenException("You do not have permission to tag this paste.");
        }

        if (paste.getTags().size() >= MAX_TAGS_PER_PASTE) {
            throw new BadRequestException("A paste can have at most " + MAX_TAGS_PER_PASTE + " tags.");
        }

        Tag tag = tagRepository.findByUserIdAndName(userId, normalized)
                .orElseGet(() -> tagRepository.save(new Tag(userId, normalized)));

        if (paste.getTags().contains(tag)) {
            throw new ConflictException("This tag is already applied to the paste.");
        }

        paste.getTags().add(tag);

        return new TagResponse(tag.getId(), tag.getName());
    }

    @Transactional
    public void removeTagFromPaste(String pastePublicId, Long tagId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        Paste paste = pasteRepository.findActiveByPublicId(pastePublicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!userId.equals(paste.getUserId())) {
            throw new ForbiddenException("You do not have permission to modify tags on this paste.");
        }

        Tag tag = tagRepository.findById(tagId)
                .orElseThrow(() -> new ResourceNotFoundException("Tag not found."));

        if (!paste.getTags().contains(tag)) {
            throw new ResourceNotFoundException("Tag not found on this paste.");
        }

        paste.getTags().remove(tag);
    }

    @Transactional(readOnly = true)
    public List<TagResponse> getTagsForPaste(String pastePublicId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        Paste paste = pasteRepository.findActiveByPublicId(pastePublicId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Paste not found or has expired."));

        if (!userId.equals(paste.getUserId())) {
            throw new ForbiddenException("You do not have permission to view tags on this paste.");
        }

        return paste.getTags().stream()
                .map(t -> new TagResponse(t.getId(), t.getName()))
                .sorted((a, b) -> a.name().compareTo(b.name()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TagResponse> getAllUserTags(Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        return tagRepository.findAllByUserIdOrderByName(userId).stream()
                .map(t -> new TagResponse(t.getId(), t.getName()))
                .toList();
    }

    private String normalizeTagName(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.trim().toLowerCase(Locale.ROOT);
    }

    // =========================================================================
    // Recently viewed
    // =========================================================================

    @Transactional
    public void recordPasteView(Long userId, Paste paste) {
        if (userId == null || paste == null) {
            return;
        }

        Instant now = Instant.now();
        pasteViewHistoryRepository.findByUserIdAndPasteId(userId, paste.getId())
                .ifPresentOrElse(
                        history -> history.setViewedAt(now),
                        () -> pasteViewHistoryRepository.save(new PasteViewHistory(userId, paste, now))
                );
    }

    @Transactional(readOnly = true)
    public List<PasteSummaryResponse> getRecentlyViewed(Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        return pasteViewHistoryRepository
                .findRecentByUserId(userId, Instant.now(), PageRequest.of(0, RECENT_ACTIVITY_LIMIT))
                .stream()
                .map(h -> toSummary(h.getPaste()))
                .toList();
    }

    // =========================================================================
    // Recently edited
    // =========================================================================

    @Transactional(readOnly = true)
    public List<PasteSummaryResponse> getRecentlyEdited(Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required.");
        }

        return pasteRepository
                .findRecentlyEditedByUser(userId, Instant.now(), PageRequest.of(0, RECENT_ACTIVITY_LIMIT))
                .stream()
                .map(this::toSummary)
                .toList();
    }

    private PasteSummaryResponse toSummary(Paste paste) {
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
}
