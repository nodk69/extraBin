package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.api.dto.CreateReplyRequest;
import com.pastebin.paste.api.dto.EditReplyRequest;
import com.pastebin.paste.api.dto.RepliesCursorPageResponse;
import com.pastebin.paste.api.dto.ReplyResponse;
import com.pastebin.paste.api.dto.ReplyVoteResponse;
import com.pastebin.paste.api.dto.VoteRequest;
import com.pastebin.paste.application.PasteReactionService;
import com.pastebin.paste.application.ReplyService;
import com.pastebin.shared.security.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@Tag(name = "Paste Replies", description = "Endpoints for threaded replies to pastes")
public class ReplyController {

    private final ReplyService replyService;
    private final PasteReactionService pasteReactionService;
    private final ClientIpResolver clientIpResolver;

    public ReplyController(ReplyService replyService, PasteReactionService pasteReactionService, ClientIpResolver clientIpResolver) {
        this.replyService = replyService;
        this.pasteReactionService = pasteReactionService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping({"/api/v1/pastes/{pasteId}/replies", "/api/pastes/{pasteId}/replies"})
    @Operation(summary = "Create reply to paste", description = "Creates a top-level or nested reply (up to 2 levels). Auth required.")
    public ResponseEntity<ReplyResponse> createReply(
            @PathVariable("pasteId") String pasteId,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @Valid @RequestBody CreateReplyRequest request,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long userId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        ReplyResponse response = replyService.createReply(pasteId, request, userId, clientIp, shareToken);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping({"/api/v1/pastes/{pasteId}/replies", "/api/pastes/{pasteId}/replies"})
    @Operation(summary = "List replies for paste", description = "Returns cursor-paginated replies with nested children.")
    public ResponseEntity<RepliesCursorPageResponse> getReplies(
            @PathVariable("pasteId") String pasteId,
            @RequestParam(value = "cursor", required = false) Long cursor,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String providedPassword,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        RepliesCursorPageResponse response = replyService.getReplies(pasteId, cursor, limit, userId, providedPassword, shareToken);
        return ResponseEntity.ok(response);
    }

    @PatchMapping({"/api/v1/replies/{id}", "/api/replies/{id}"})
    @Operation(summary = "Edit own reply", description = "Edits content of an existing reply. Author only.")
    public ResponseEntity<ReplyResponse> editReply(
            @PathVariable("id") Long id,
            @Valid @RequestBody EditReplyRequest request,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        ReplyResponse response = replyService.editReply(id, request, userId);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping({"/api/v1/replies/{id}", "/api/replies/{id}"})
    @Operation(summary = "Soft-delete own reply", description = "Soft-deletes a reply preserving thread hierarchy. Author only.")
    public ResponseEntity<Void> deleteReply(
            @PathVariable("id") Long id,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        replyService.deleteReply(id, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping({"/api/v1/pastes/{pasteId}/replies/{replyId}/vote", "/api/pastes/{pasteId}/replies/{replyId}/vote"})
    @Operation(summary = "Vote on a reply", description = "Casts an upvote or downvote on a reply using authenticated session or client IP hash.")
    public ResponseEntity<ReplyVoteResponse> voteReply(
            @PathVariable("pasteId") String pasteId,
            @PathVariable("replyId") Long replyId,
            @Valid @RequestBody VoteRequest request,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestParam(value = "token", required = false) String shareToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long userId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String effectiveToken = (shareToken != null && !shareToken.isBlank()) ? shareToken : tokenHeader;
        ReplyVoteResponse response = pasteReactionService.voteReply(pasteId, replyId, request, userId, password, clientIp, effectiveToken);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping({"/api/v1/pastes/{pasteId}/replies/{replyId}/vote", "/api/pastes/{pasteId}/replies/{replyId}/vote"})
    @Operation(summary = "Retract vote on a reply", description = "Retracts user's upvote or downvote on a reply.")
    public ResponseEntity<ReplyVoteResponse> retractReplyVote(
            @PathVariable("pasteId") String pasteId,
            @PathVariable("replyId") Long replyId,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestParam(value = "token", required = false) String shareToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long userId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String effectiveToken = (shareToken != null && !shareToken.isBlank()) ? shareToken : tokenHeader;
        ReplyVoteResponse response = pasteReactionService.retractReplyVote(pasteId, replyId, userId, password, clientIp, effectiveToken);
        return ResponseEntity.ok(response);
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getId();
        }
        return null;
    }
}
