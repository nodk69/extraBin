package com.pastebin.paste.api.dto;

import java.util.List;

public record CommentsListResponse(
        String pasteId,
        long totalComments,
        List<CommentResponse> comments
) {}
