package com.pastebin.paste.api.dto;

import java.util.List;

public record FolderOverviewResponse(
        List<FolderResponse> folders,
        long unfiledCount,
        long totalCount
) {}
