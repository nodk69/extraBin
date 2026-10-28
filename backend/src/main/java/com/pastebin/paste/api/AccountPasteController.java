package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.api.dto.PasteRevisionResponse;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.api.dto.PasteViewResponse;
import com.pastebin.paste.application.PasteManagementService;
import com.pastebin.shared.dto.PagedResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/account/pastes")
@Tag(name = "Account Pastes", description = "Endpoints for managing account-owned pastes and revision history")
public class AccountPasteController {

    private static final java.util.Set<String> ALLOWED_SORT_FIELDS = java.util.Set.of("createdAt", "updatedAt", "title");

    private final PasteManagementService pasteManagementService;

    public AccountPasteController(PasteManagementService pasteManagementService) {
        this.pasteManagementService = pasteManagementService;
    }

    @GetMapping
    @Operation(summary = "List owned pastes", description = "Retrieves paginated list of pastes owned by the authenticated user with optional search, tag filter, and sorting.")
    public ResponseEntity<PagedResponse<PasteSummaryResponse>> listMyPastes(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @RequestParam(name = "visibility", required = false) String visibility,
            @RequestParam(name = "folderId", required = false) Long folderId,
            @RequestParam(name = "unfiled", required = false) Boolean unfiled,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "tag", required = false) String tag,
            @RequestParam(name = "sort", defaultValue = "createdAt") String sort,
            @RequestParam(name = "direction", required = false) String direction,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        if (!ALLOWED_SORT_FIELDS.contains(sort)) {
            throw new com.pastebin.shared.errors.BadRequestException(
                    "Invalid sort field. Allowed values: createdAt, updatedAt, title.");
        }
        Sort.Direction dir;
        if (direction == null || direction.isBlank()) {
            dir = "title".equals(sort) ? Sort.Direction.ASC : Sort.Direction.DESC;
        } else if ("asc".equalsIgnoreCase(direction)) {
            dir = Sort.Direction.ASC;
        } else if ("desc".equalsIgnoreCase(direction)) {
            dir = Sort.Direction.DESC;
        } else {
            throw new com.pastebin.shared.errors.BadRequestException(
                    "Invalid sort direction. Allowed values: asc, desc.");
        }

        com.pastebin.paste.domain.Visibility visibilityEnum = null;
        if (visibility != null && !visibility.isBlank() && !"ALL".equalsIgnoreCase(visibility.trim())) {
            try {
                visibilityEnum = com.pastebin.paste.domain.Visibility.valueOf(visibility.trim().toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                throw new com.pastebin.shared.errors.BadRequestException("Invalid visibility value: " + visibility);
            }
        }

        int boundedSize = Math.min(Math.max(1, size), 50);

        Sort librarySort = Sort.by(dir, sort).and(Sort.by(Sort.Order.desc("id")));
        PageRequest pageRequest = PageRequest.of(Math.max(0, page), boundedSize, librarySort);
        PagedResponse<PasteSummaryResponse> response = pasteManagementService.searchUserPastes(
                principal.getId(), visibilityEnum, folderId, unfiled, search, tag, pageRequest);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit owned paste", description = "Updates paste with optimistic concurrency control and creates historical revision.")
    public ResponseEntity<PasteViewResponse> editPaste(
            @PathVariable("id") String id,
            @Valid @RequestBody EditPasteRequest request,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        PasteViewResponse response = pasteManagementService.editPaste(id, principal.getId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete owned paste", description = "Deletes owned paste and all associated revisions.")
    public ResponseEntity<Void> deletePaste(
            @PathVariable("id") String id,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        pasteManagementService.deleteOwnedPaste(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/revisions")
    @Operation(summary = "Get paste revisions", description = "Returns revision history for an owned paste.")
    public ResponseEntity<List<PasteRevisionResponse>> getRevisions(
            @PathVariable("id") String id,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        List<PasteRevisionResponse> revisions = pasteManagementService.getPasteRevisions(id, principal.getId());
        return ResponseEntity.ok(revisions);
    }

    @PostMapping("/{id}/revisions/{version}/restore")
    @Operation(summary = "Restore paste revision", description = "Restores full paste workspace to the specified historical revision snapshot.")
    public ResponseEntity<PasteViewResponse> restoreRevision(
            @PathVariable("id") String id,
            @PathVariable("version") Long version,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        PasteViewResponse response = pasteManagementService.restoreRevision(id, version, principal.getId());
        return ResponseEntity.ok(response);
    }
}
