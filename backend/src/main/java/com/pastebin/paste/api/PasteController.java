package com.pastebin.paste.api;

import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.DeleteAnonymousPasteRequest;
import com.pastebin.paste.api.dto.PasteViewResponse;
import com.pastebin.paste.api.dto.UpdateSlugRequest;
import com.pastebin.paste.application.PasteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/pastes")
@Tag(name = "Pastes", description = "Endpoints for creating, reading, and managing text pastes")
public class PasteController {

    private final PasteService pasteService;
    private final com.pastebin.paste.application.PasteReactionService pasteReactionService;
    private final com.pastebin.shared.security.ClientIpResolver clientIpResolver;

    public PasteController(PasteService pasteService,
                           com.pastebin.paste.application.PasteReactionService pasteReactionService,
                           com.pastebin.shared.security.ClientIpResolver clientIpResolver) {
        this.pasteService = pasteService;
        this.pasteReactionService = pasteReactionService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping
    @Operation(summary = "Create a new paste", description = "Creates a public, unlisted, or private paste with expiration.")
    public ResponseEntity<CreatePasteResponse> createPaste(
            @Valid @RequestBody CreatePasteRequest request,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);

        CreatePasteResponse response = pasteService.createPaste(request, authenticatedUserId, clientIp);
        URI location = URI.create("/api/v1/pastes/" + response.id());

        return ResponseEntity.created(location).body(response);
    }

    @PostMapping("/encrypted")
    @Operation(summary = "Create an end-to-end encrypted paste", description = "Stores client-side encrypted ciphertext with zero knowledge on server.")
    public ResponseEntity<CreatePasteResponse> createEncryptedPaste(
            @Valid @RequestBody CreateEncryptedPasteRequest request,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);

        CreatePasteResponse response = pasteService.createEncryptedPaste(request, authenticatedUserId, clientIp);
        URI location = URI.create("/api/v1/pastes/" + response.id());

        return ResponseEntity.created(location).body(response);
    }

    @PostMapping("/{id}/decrypt-failed")
    @Operation(summary = "Report client-side decryption failure", description = "Increments telemetry counter for client-side decryption failure.")
    public ResponseEntity<Void> reportDecryptionFailure(
            @PathVariable("id") String id,
            HttpServletRequest httpRequest
    ) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        pasteService.recordDecryptionFailure(id, clientIp);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get paste details and content", description = "Reads paste metadata and content enforcing visibility and expiration rules.")
    public ResponseEntity<PasteViewResponse> getPaste(
            @PathVariable("id") String id,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @RequestHeader(value = "X-Skip-View-Count", required = false) Boolean skipViewCount,
            @RequestParam(value = "skipViewCount", required = false) Boolean skipViewCountParam,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;

        boolean sessionAlreadyViewed = false;
        var existingSession = httpRequest.getSession(false);
        if (existingSession != null && Boolean.TRUE.equals(existingSession.getAttribute("viewed_paste_" + id))) {
            sessionAlreadyViewed = true;
        }

        boolean shouldSkip = Boolean.TRUE.equals(skipViewCount) || Boolean.TRUE.equals(skipViewCountParam) || sessionAlreadyViewed;
        PasteViewResponse response = pasteService.getPasteView(id, authenticatedUserId, password, clientIp, shouldSkip, shareToken, unlockToken);

        if (!shouldSkip && !response.passwordRequired() && !response.viewOnce()) {
            var activeSession = httpRequest.getSession(true);
            activeSession.setAttribute("viewed_paste_" + id, Boolean.TRUE);
        }

        boolean isPublicAnonymous = response.visibility() == com.pastebin.paste.domain.Visibility.PUBLIC
                && authenticatedUserId == null
                && !response.passwordRequired()
                && !response.passwordProtected()
                && !response.viewOnce()
                && !response.burnAfterReading();

        String cacheControl = isPublicAnonymous
                ? "private, no-cache"
                : "private, no-cache, no-store, must-revalidate";

        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, cacheControl)
                .header(org.springframework.http.HttpHeaders.VARY, "X-Share-Token, X-Paste-Password, X-Paste-Unlock, Cookie")
                .body(response);
    }

    @PostMapping("/{id}/unlock")
    @Operation(summary = "Unlock a password-protected paste", description = "Validates the password and returns a short-lived, IP-bound unlock token.")
    public ResponseEntity<com.pastebin.paste.api.dto.UnlockResponse> unlockPaste(
            @PathVariable("id") String id,
            @RequestBody(required = false) com.pastebin.paste.api.dto.UnlockRequest request,
            HttpServletRequest httpRequest
    ) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String password = (request != null) ? request.password() : null;

        PasteService.UnlockGrant grant = pasteService.unlockPaste(id, password, clientIp);

        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate")
                .header(org.springframework.http.HttpHeaders.VARY, "X-Paste-Password")
                .body(new com.pastebin.paste.api.dto.UnlockResponse(grant.unlockToken(), grant.expiresAt()));
    }

    @PostMapping("/{id}/revoke-link")
    @Operation(summary = "Revoke unlisted paste link", description = "Revokes an unlisted paste's sharing token. Requires owner authentication or valid anonymous deletion capability.")
    public ResponseEntity<Void> revokeLink(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Deletion-Capability", required = false) String deletionCapHeader,
            @RequestHeader(value = "X-Comment-Delete-Token", required = false) String deleteTokenHeader,
            @RequestBody(required = false) com.pastebin.paste.api.dto.RevokeLinkRequest request,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String headerCap = (deletionCapHeader != null && !deletionCapHeader.isBlank())
                ? deletionCapHeader.trim()
                : (deleteTokenHeader != null && !deleteTokenHeader.isBlank())
                    ? deleteTokenHeader.trim()
                    : null;
        String deletionCapability = (headerCap != null)
                ? headerCap
                : (request != null) ? request.deletionCapability() : null;

        pasteService.revokeLink(id, deletionCapability, authenticatedUserId, clientIp);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/rotate-link")
    @Operation(summary = "Rotate unlisted paste link", description = "Rotates an unlisted paste's sharing token, invalidating old tokens and returning a newly issued share token.")
    public ResponseEntity<com.pastebin.paste.api.dto.RotateLinkResponse> rotateLink(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Deletion-Capability", required = false) String deletionCapHeader,
            @RequestHeader(value = "X-Comment-Delete-Token", required = false) String deleteTokenHeader,
            @RequestBody(required = false) com.pastebin.paste.api.dto.RotateLinkRequest request,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String headerCap = (deletionCapHeader != null && !deletionCapHeader.isBlank())
                ? deletionCapHeader.trim()
                : (deleteTokenHeader != null && !deleteTokenHeader.isBlank())
                    ? deleteTokenHeader.trim()
                    : null;
        String deletionCapability = (headerCap != null)
                ? headerCap
                : (request != null) ? request.deletionCapability() : null;

        String freshToken = pasteService.rotateLink(id, deletionCapability, authenticatedUserId, clientIp);
        return ResponseEntity.ok(new com.pastebin.paste.api.dto.RotateLinkResponse(id, freshToken));
    }

    @GetMapping("/{id}/embed")
    @Operation(summary = "Get paste for secure embedding", description = "Returns safe paste data for embedding. Strictly restricted to public, non-password-protected, non-view-once pastes.")
    public ResponseEntity<com.pastebin.paste.api.dto.EmbedPasteResponse> getEmbedPaste(
            @PathVariable("id") String id
    ) {
        com.pastebin.paste.api.dto.EmbedPasteResponse response = pasteService.getEmbedView(id);
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate")
                .header(org.springframework.http.HttpHeaders.PRAGMA, "no-cache")
                .header(org.springframework.http.HttpHeaders.EXPIRES, "0")
                .body(response);
    }

    @PostMapping("/{id}/delete-anonymous")
    @Operation(summary = "Delete an anonymous paste", description = "Deletes an anonymous paste using the one-time secret capability.")
    public ResponseEntity<Void> deleteAnonymousPaste(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Deletion-Capability", required = false) String deletionCapHeader,
            @RequestHeader(value = "X-Comment-Delete-Token", required = false) String deleteTokenHeader,
            @Valid @RequestBody(required = false) DeleteAnonymousPasteRequest request,
            HttpServletRequest httpRequest
    ) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String headerCap = (deletionCapHeader != null && !deletionCapHeader.isBlank())
                ? deletionCapHeader.trim()
                : (deleteTokenHeader != null && !deleteTokenHeader.isBlank())
                    ? deleteTokenHeader.trim()
                    : null;
        String deletionCapability = (headerCap != null)
                ? headerCap
                : (request != null) ? request.deletionCapability() : null;

        if (deletionCapability == null || deletionCapability.isBlank()) {
            throw new com.pastebin.shared.errors.BadRequestException("Deletion capability is required.");
        }

        pasteService.deleteAnonymousPaste(id, deletionCapability, clientIp);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/slug")
    @Operation(summary = "Update paste custom URL slug", description = "Allows editing the URL slug of a paste using authenticated session or anonymous capability.")
    public ResponseEntity<Map<String, String>> updateSlug(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Deletion-Capability", required = false) String deletionCapHeader,
            @RequestHeader(value = "X-Comment-Delete-Token", required = false) String deleteTokenHeader,
            @Valid @RequestBody UpdateSlugRequest request,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String headerCap = (deletionCapHeader != null && !deletionCapHeader.isBlank())
                ? deletionCapHeader.trim()
                : (deleteTokenHeader != null && !deleteTokenHeader.isBlank())
                    ? deleteTokenHeader.trim()
                    : null;
        String deletionCapability = (headerCap != null)
                ? headerCap
                : request.deletionCapability();

        String updatedSlug = pasteService.updatePasteSlug(id, request.newSlug(), deletionCapability, authenticatedUserId, clientIp);
        return ResponseEntity.ok(Map.of("id", updatedSlug, "url", "/p/" + updatedSlug));
    }

    @PostMapping("/{id}/vote")
    @Operation(summary = "Vote on a paste", description = "Casts an upvote or downvote on a paste using authenticated session or client IP hash.")
    public ResponseEntity<com.pastebin.paste.api.dto.PasteVoteResponse> votePaste(
            @PathVariable("id") String id,
            @Valid @RequestBody com.pastebin.paste.api.dto.VoteRequest request,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String shareTokenHeader,
            @RequestParam(value = "token", required = false) String tokenParam,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : shareTokenHeader;
        com.pastebin.paste.api.dto.PasteVoteResponse response = pasteReactionService.votePaste(id, request, authenticatedUserId, password, clientIp, shareToken);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}/vote")
    @Operation(summary = "Retract vote on a paste", description = "Retracts user's upvote or downvote on a paste.")
    public ResponseEntity<com.pastebin.paste.api.dto.PasteVoteResponse> retractPasteVote(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String shareTokenHeader,
            @RequestParam(value = "token", required = false) String tokenParam,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : shareTokenHeader;
        com.pastebin.paste.api.dto.PasteVoteResponse response = pasteReactionService.retractPasteVote(id, authenticatedUserId, password, clientIp, shareToken);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/star")
    @Operation(summary = "Star a paste", description = "Stars a paste for the authenticated user.")
    public ResponseEntity<com.pastebin.paste.api.dto.PasteStarResponse> starPaste(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String shareTokenHeader,
            @RequestParam(value = "token", required = false) String tokenParam,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : shareTokenHeader;
        com.pastebin.paste.api.dto.PasteStarResponse response = pasteReactionService.starPaste(id, authenticatedUserId, password, clientIp, shareToken);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}/star")
    @Operation(summary = "Unstar a paste", description = "Removes star from a paste for the authenticated user.")
    public ResponseEntity<com.pastebin.paste.api.dto.PasteStarResponse> unstarPaste(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Share-Token", required = false) String shareTokenHeader,
            @RequestParam(value = "token", required = false) String tokenParam,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : shareTokenHeader;
        com.pastebin.paste.api.dto.PasteStarResponse response = pasteReactionService.unstarPaste(id, authenticatedUserId, password, clientIp, shareToken);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/starred")
    @Operation(summary = "Get starred pastes", description = "Returns all pastes starred by the authenticated user.")
    public ResponseEntity<java.util.List<com.pastebin.paste.api.dto.PasteSummaryResponse>> getStarredPastes(
            @AuthenticationPrincipal Object principal
    ) {
        Long authenticatedUserId = extractUserId(principal);
        java.util.List<com.pastebin.paste.api.dto.PasteSummaryResponse> starred = pasteService.getStarredPastes(authenticatedUserId);
        return ResponseEntity.ok(starred);
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof com.pastebin.identity.infrastructure.PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getId();
        }
        return null;
    }
}
