package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.api.dto.AddTagRequest;
import com.pastebin.paste.api.dto.TagResponse;
import com.pastebin.paste.application.LibraryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/pastes/{pasteId}/tags")
@PreAuthorize("isAuthenticated()")
@Tag(name = "Paste Tags", description = "Endpoints for managing tags on owned pastes")
public class PasteTagController {

    private final LibraryService libraryService;

    public PasteTagController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @PostMapping
    @Operation(summary = "Add a tag to a paste", description = "Applies a normalized tag to an owned paste. Max 10 tags per paste.")
    public ResponseEntity<TagResponse> addTag(
            @PathVariable("pasteId") String pasteId,
            @Valid @RequestBody AddTagRequest request,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        TagResponse response = libraryService.addTagToPaste(pasteId, principal.getId(), request.name());
        return ResponseEntity.status(201).body(response);
    }

    @GetMapping
    @Operation(summary = "List tags on a paste", description = "Returns tags applied to an owned paste.")
    public ResponseEntity<List<TagResponse>> getTags(
            @PathVariable("pasteId") String pasteId,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        return ResponseEntity.ok(libraryService.getTagsForPaste(pasteId, principal.getId()));
    }

    @DeleteMapping("/{tagId}")
    @Operation(summary = "Remove a tag from a paste", description = "Removes a tag from an owned paste.")
    public ResponseEntity<Void> removeTag(
            @PathVariable("pasteId") String pasteId,
            @PathVariable("tagId") Long tagId,
            @AuthenticationPrincipal PastebinUserPrincipal principal
    ) {
        libraryService.removeTagFromPaste(pasteId, tagId, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
