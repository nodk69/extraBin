package com.pastebin.discovery.application;

import com.pastebin.discovery.api.dto.PublicTagResponse;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.dto.PagedResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Service
public class DiscoveryService {

    private final PasteRepository pasteRepository;
    private final PasteSummaryMapper summaryMapper;

    public DiscoveryService(PasteRepository pasteRepository, PasteSummaryMapper summaryMapper) {
        this.pasteRepository = pasteRepository;
        this.summaryMapper = summaryMapper;
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getPublicPastes(String language, String q, String tag,
                                                               String window, String sort,
                                                               int page, int size) {
        Instant now = Instant.now();
        Instant windowStart = resolveWindowStart(window, now);
        Sort sortSpec = resolveSort(sort);

        Page<Paste> result = pasteRepository.findDiscoveryPastes(
                now,
                normalizeLanguage(language),
                normalizeTag(tag),
                buildSearchTerm(q),
                windowStart,
                PageRequest.of(page, size, sortSpec));

        List<PasteSummaryResponse> summaries = summaryMapper.toSummaries(result.getContent());
        return PagedResponse.of(summaries, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<PublicTagResponse> getPublicTags() {
        List<Object[]> rows = pasteRepository.countPublicTagUsage(Instant.now(), PageRequest.of(0, 50));
        return rows.stream()
                .map(row -> new PublicTagResponse((String) row[0], (Long) row[1]))
                .toList();
    }

    @Transactional(readOnly = true)
    public PagedResponse<PasteSummaryResponse> getMostSaved(String language, int page, int size) {
        Instant now = Instant.now();
        Sort sortSpec = Sort.by(Sort.Direction.DESC, "starsCount").and(Sort.by(Sort.Direction.ASC, "publicId"));

        Page<Paste> result = pasteRepository.findMostSavedPastes(
                now,
                normalizeLanguage(language),
                PageRequest.of(page, size, sortSpec));

        List<PasteSummaryResponse> summaries = summaryMapper.toSummaries(result.getContent());
        return PagedResponse.of(summaries, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    private Instant resolveWindowStart(String window, Instant now) {
        if (window == null || window.isBlank() || window.equalsIgnoreCase("all")) {
            return null;
        }
        return switch (window.toLowerCase(Locale.ROOT)) {
            case "24h" -> now.minus(Duration.ofHours(24));
            case "7d" -> now.minus(Duration.ofDays(7));
            case "30d" -> now.minus(Duration.ofDays(30));
            default -> null;
        };
    }

    private Sort resolveSort(String sort) {
        Sort publicIdTieBreak = Sort.by(Sort.Direction.ASC, "publicId");
        String value = (sort == null || sort.isBlank()) ? "newest" : sort.toLowerCase(Locale.ROOT);
        return switch (value) {
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt").and(publicIdTieBreak);
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt").and(publicIdTieBreak);
            case "updated" -> Sort.by(Sort.Direction.DESC, "updatedAt").and(publicIdTieBreak);
            default -> Sort.by(Sort.Direction.DESC, "createdAt").and(publicIdTieBreak);
        };
    }

    private String normalizeLanguage(String language) {
        if (language == null || language.isBlank() || language.equalsIgnoreCase("all")) {
            return null;
        }
        return language.toLowerCase(Locale.ROOT).trim();
    }

    private String normalizeTag(String tag) {
        if (tag == null || tag.isBlank()) {
            return null;
        }
        return tag.toLowerCase(Locale.ROOT).trim();
    }

    private String buildSearchTerm(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        return q.toLowerCase(Locale.ROOT).trim();
    }
}
