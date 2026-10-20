package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.api.dto.PasteSummaryResponse;
import com.pastebin.paste.api.dto.TagResponse;
import com.pastebin.paste.application.LibraryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/account")
@Tag(name = "Account Library", description = "Personal library activity endpoints: tags, recently viewed, recently edited")
public class AccountLibraryController {

    private final LibraryService libraryService;

    public AccountLibraryController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @GetMapping("/tags")
    @Operation(summary = "List user tags", description = "Returns all tags owned by the authenticated user, ordered alphabetically.")
    public ResponseEntity<List<TagResponse>> listMyTags(@AuthenticationPrincipal PastebinUserPrincipal principal) {
        return ResponseEntity.ok(libraryService.getAllUserTags(principal.getId()));
    }

    @GetMapping("/recently-viewed")
    @Operation(summary = "Recently viewed pastes", description = "Returns up to 50 pastes most recently opened by the authenticated user.")
    public ResponseEntity<List<PasteSummaryResponse>> recentlyViewed(@AuthenticationPrincipal PastebinUserPrincipal principal) {
        return ResponseEntity.ok(libraryService.getRecentlyViewed(principal.getId()));
    }

    @GetMapping("/recently-edited")
    @Operation(summary = "Recently edited pastes", description = "Returns up to 50 owned pastes ordered by last meaningful edit, most recent first.")
    public ResponseEntity<List<PasteSummaryResponse>> recentlyEdited(@AuthenticationPrincipal PastebinUserPrincipal principal) {
        return ResponseEntity.ok(libraryService.getRecentlyEdited(principal.getId()));
    }
}
