package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.VoteType;

public record CommentVoteResponse(
        Long commentId,
        long upvotes,
        long downvotes,
        VoteType userVote
) {}
