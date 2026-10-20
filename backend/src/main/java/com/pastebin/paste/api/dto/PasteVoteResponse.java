package com.pastebin.paste.api.dto;

import com.pastebin.paste.domain.VoteType;

public record PasteVoteResponse(
        String pasteId,
        long upvotes,
        long downvotes,
        VoteType userVote
) {}
