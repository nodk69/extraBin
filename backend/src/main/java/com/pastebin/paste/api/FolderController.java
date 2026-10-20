package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.api.dto.*;
import com.pastebin.paste.application.FolderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/folders")
@Tag(name = "Folders", description = "Endpoints for managing folders and organizing user pastes")
public class FolderController {

    private final FolderService folderService;

    public FolderController(FolderService folderService) {
        this.folderService = folderService;
    }

    @GetMapping
    @Operation(summary = "List folders", description = "Lists all folders owned by the authenticated user with active paste counts.")
    public ResponseEntity<FolderOverviewResponse> listFolders(
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        return ResponseEntity.ok(folderService.listFolders(principal.getId()));
    }

    @PostMapping
    @Operation(summary = "Create folder", description = "Creates a new folder for the authenticated user.")
    public ResponseEntity<FolderResponse> createFolder(
            @Valid @RequestBody CreateFolderRequest request,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        FolderResponse response = folderService.createFolder(principal.getId(), request.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Rename folder", description = "Renames an existing owned folder.")
    public ResponseEntity<FolderResponse> renameFolder(
            @PathVariable("id") Long id,
            @Valid @RequestBody RenameFolderRequest request,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        FolderResponse response = folderService.renameFolder(principal.getId(), id, request.name());
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete folder", description = "Deletes a folder and moves its pastes to Unfiled.")
    public ResponseEntity<Void> deleteFolder(
            @PathVariable("id") Long id,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        folderService.deleteFolder(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/pastes/{pastePublicId}/move")
    @Operation(summary = "Move paste to folder", description = "Moves an owned paste to a folder or unfiles it.")
    public ResponseEntity<PasteSummaryResponse> movePaste(
            @PathVariable("pastePublicId") String pastePublicId,
            @RequestBody MovePasteRequest request,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        PasteSummaryResponse response = folderService.movePasteToFolder(principal.getId(), pastePublicId, request.folderId());
        return ResponseEntity.ok(response);
    }
}
