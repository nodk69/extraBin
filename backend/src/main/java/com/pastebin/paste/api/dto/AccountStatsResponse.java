package com.pastebin.paste.api.dto;

public record AccountStatsResponse(
        long totalPastes,
        long publicCount,
        long unlistedCount,
        long privateCount,
        long totalLines,
        long totalViews
) {}
