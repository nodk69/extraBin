package com.pastebin.discovery.api.dto;

import com.pastebin.paste.api.dto.PasteSummaryResponse;

import java.time.Instant;
import java.util.List;

/**
 * Public projection of an author. Contains only fields the platform persists and explicitly
 * exposes: the public username, account creation instant, eligible-public-paste aggregates,
 * and a bounded recent-work list.
 *
 * Deliberately absent: internal id, email, password hash, role, session state, verification
 * state, and any private setting. Tests assert on the raw response body to keep it that way.
 */
public record PublicAuthorProfileResponse(
        String username,
        String displayName,
        String bio,
        String avatarUrl,
        String githubUrl,
        String linkedinUrl,
        String xUrl,
        Instant joinedAt,
        long publicPasteCount,
        long totalViews,
        long totalSaves,
        List<PasteSummaryResponse> recentPastes,
        List<PasteSummaryResponse> popularPastes,
        List<String> topLanguages,
        long languagesCount,
        long followerCount,
        long followingCount,
        boolean followedByViewer
) {
}
