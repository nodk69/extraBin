package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.api.dto.CommentsListResponse;
import com.pastebin.paste.api.dto.CreateCommentRequest;
import com.pastebin.paste.api.dto.CreateCommentResponse;
import com.pastebin.paste.api.dto.DeleteCommentRequest;
import com.pastebin.paste.application.PasteCommentService;
import com.pastebin.shared.security.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/pastes/{id}/comments")
@Tag(name = "Paste Comments", description = "Endpoints for viewing, adding, and managing comments on public pastes")
public class PasteCommentController {

    private final PasteCommentService commentService;
    private final com.pastebin.paste.application.PasteReactionService pasteReactionService;
    private final ClientIpResolver clientIpResolver;

    public PasteCommentController(PasteCommentService commentService,
                                  com.pastebin.paste.application.PasteReactionService pasteReactionService,
                                  ClientIpResolver clientIpResolver) {
        this.commentService = commentService;
        this.pasteReactionService = pasteReactionService;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping
    @Operation(summary = "List comments for a public paste", description = "Returns all comments on a public paste in chronological order. Password-protected pastes require the X-Paste-Password header.")
    public ResponseEntity<CommentsListResponse> getComments(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Paste-Password", required = false) String providedPassword,
            HttpServletRequest httpRequest,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        String role = extractRole(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);

        CommentsListResponse response = commentService.getComments(id, userId, role, providedPassword, clientIp);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @Operation(summary = "Post a comment on a public paste", description = "Adds a comment to an active public paste. Anonymous users receive a one-time deletion capability. Password-protected pastes require the X-Paste-Password header.")
    public ResponseEntity<CreateCommentResponse> addComment(
            @PathVariable("id") String id,
            @Valid @RequestBody CreateCommentRequest request,
            @RequestHeader(value = "X-Paste-Password", required = false) String providedPassword,
            HttpServletRequest httpRequest,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        String username = extractUsername(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);

        CreateCommentResponse response = commentService.addComment(id, request, userId, username, providedPassword, clientIp);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/{commentId}")
    @Operation(summary = "Delete a comment", description = "Deletes a comment if the caller is the comment author, paste owner, admin, or provides the one-time deletion capability in the X-Comment-Delete-Token header (or JSON body). Password-protected pastes require the X-Paste-Password header. The capability is never accepted as a URL query parameter (P2-03).")
    public ResponseEntity<Void> deleteComment(
            @PathVariable("id") String id,
            @PathVariable("commentId") Long commentId,
            @RequestHeader(value = "X-Comment-Delete-Token", required = false) String headerToken,
            @RequestBody(required = false) DeleteCommentRequest bodyRequest,
            @RequestHeader(value = "X-Paste-Password", required = false) String providedPassword,
            HttpServletRequest httpRequest,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        String role = extractRole(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);

        String capability = (headerToken != null && !headerToken.isBlank())
                ? headerToken.trim()
                : (bodyRequest != null && bodyRequest.deletionCapability() != null)
                    ? bodyRequest.deletionCapability().trim()
                    : null;

        commentService.deleteComment(id, commentId, userId, capability, role, providedPassword, clientIp);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{commentId}/vote")
    @Operation(summary = "Vote on a comment", description = "Casts an upvote or downvote on a comment using authenticated session or client IP hash.")
    public ResponseEntity<com.pastebin.paste.api.dto.CommentVoteResponse> voteComment(
            @PathVariable("id") String id,
            @PathVariable("commentId") Long commentId,
            @Valid @RequestBody com.pastebin.paste.api.dto.VoteRequest request,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestParam(value = "token", required = false) String shareToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long userId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String effectiveToken = (shareToken != null && !shareToken.isBlank()) ? shareToken : tokenHeader;
        com.pastebin.paste.api.dto.CommentVoteResponse response = pasteReactionService.voteComment(id, commentId, request, userId, password, clientIp, effectiveToken);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{commentId}/vote")
    @Operation(summary = "Retract vote on a comment", description = "Retracts user's upvote or downvote on a comment.")
    public ResponseEntity<com.pastebin.paste.api.dto.CommentVoteResponse> retractCommentVote(
            @PathVariable("id") String id,
            @PathVariable("commentId") Long commentId,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestParam(value = "token", required = false) String shareToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long userId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String effectiveToken = (shareToken != null && !shareToken.isBlank()) ? shareToken : tokenHeader;
        com.pastebin.paste.api.dto.CommentVoteResponse response = pasteReactionService.retractCommentVote(id, commentId, userId, password, clientIp, effectiveToken);
        return ResponseEntity.ok(response);
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getId();
        }
        return null;
    }

    private String extractUsername(Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getUsername();
        }
        return null;
    }

    private String extractRole(Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority)
                    .findFirst()
                    .orElse(null);
        }
        return null;
    }
}
