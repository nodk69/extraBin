package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.VoteType;

public record ReplyVoteResponse(
        Long replyId,
        long upvotes,
        long downvotes,
        VoteType userVote
) {}
