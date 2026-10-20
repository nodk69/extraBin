package com.pastebin.discovery.application;

import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.infrastructure.PasteRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Single assembler for the public paste-summary DTO used by every discovery surface and
 * author profile. Batches author and tag lookups so a page of results costs a bounded number
 * of queries (no N+1).
 */
@Component
public class PasteSummaryMapper {

    private final PasteRepository pasteRepository;
    private final UserRepository userRepository;

    public PasteSummaryMapper(PasteRepository pasteRepository, UserRepository userRepository) {
        this.pasteRepository = pasteRepository;
        this.userRepository = userRepository;
    }

    /** Resolves each paste's author from the persisted ownership relation. */
    public List<PasteSummaryResponse> toSummaries(List<Paste> pastes) {
        if (pastes.isEmpty()) {
            return List.of();
        }
        Set<Long> userIds = new HashSet<>();
        for (Paste paste : pastes) {
            if (paste.getUserId() != null) {
                userIds.add(paste.getUserId());
            }
        }
        Map<Long, String> usernames = userIds.isEmpty()
                ? Map.of()
                : userRepository.findAllById(userIds).stream()
                        .collect(Collectors.toMap(User::getId, User::getUsername, (a, b) -> a));
        return map(pastes, usernames);
    }

    /**
     * Author-scoped listing: every row already belongs to {@code username}, so the user lookup
     * is skipped while the DTO shape stays identical to discovery.
     */
    public List<PasteSummaryResponse> toAuthorSummaries(List<Paste> pastes, String username) {
        if (pastes.isEmpty()) {
            return List.of();
        }
        Map<Long, String> usernames = new HashMap<>();
        for (Paste paste : pastes) {
            if (paste.getUserId() != null) {
                usernames.put(paste.getUserId(), username);
            }
        }
        return map(pastes, usernames);
    }

    private List<PasteSummaryResponse> map(List<Paste> pastes, Map<Long, String> usernames) {
        Map<Long, List<String>> tagNames = new HashMap<>();
        List<Long> pasteIds = pastes.stream().map(Paste::getId).filter(Objects::nonNull).toList();
        if (!pasteIds.isEmpty()) {
            for (Object[] row : pasteRepository.findTagNamesByPasteIds(pasteIds)) {
                Long pasteId = (Long) row[0];
                tagNames.computeIfAbsent(pasteId, key -> new ArrayList<>()).add((String) row[1]);
            }
        }

        return pastes.stream()
                .map(paste -> new PasteSummaryResponse(
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
                        null,
                        null,
                        paste.getUserId() == null ? null : usernames.get(paste.getUserId()),
                        tagNames.getOrDefault(paste.getId(), List.of()),
                        paste.getStarsCount()))
                .toList();
    }
}
