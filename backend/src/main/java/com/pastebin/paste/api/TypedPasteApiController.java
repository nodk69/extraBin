package com.pastebin.paste.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.paste.application.PasteService;
import com.pastebin.shared.errors.ResourceNotFoundException;
import com.pastebin.shared.http.VaryHeader;
import com.pastebin.shared.security.ClientIpResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/pastes")
@Tag(name = "Typed Paste API", description = "Endpoints for fetching pastes with format-specific media types, ETags, and Cache-Control")
public class TypedPasteApiController {

    private static final Map<String, MediaType> SUPPORTED_SUFFIXES = Map.of(
            "json", MediaType.APPLICATION_JSON,
            "yaml", MediaType.parseMediaType("application/yaml"),
            "md", MediaType.parseMediaType("text/markdown;charset=utf-8"),
            "txt", MediaType.parseMediaType("text/plain;charset=utf-8"),
            "csv", MediaType.parseMediaType("text/csv;charset=utf-8"),
            "xml", MediaType.parseMediaType("application/xml;charset=utf-8")
    );

    private final PasteService pasteService;
    private final ClientIpResolver clientIpResolver;

    public TypedPasteApiController(PasteService pasteService, ClientIpResolver clientIpResolver) {
        this.pasteService = pasteService;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping({
            "/{id}.json",
            "/{id}.yaml",
            "/{id}.md",
            "/{id}.txt",
            "/{id}.csv",
            "/{id}.xml"
    })
    @Operation(summary = "Get paste content formatted as a specific MIME type", description = "Serves plaintext paste content with ETag and visibility-aware Cache-Control.")
    public ResponseEntity<byte[]> getTypedPaste(
            @PathVariable("id") String id,
            @org.springframework.web.bind.annotation.RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        if (id == null || id.contains(".") || !id.matches("^[A-Za-z0-9_-]+$")) {
            throw new ResourceNotFoundException("Invalid paste id format.");
        }

        String uri = httpRequest.getRequestURI();
        int dotIdx = uri.lastIndexOf('.');
        if (dotIdx == -1) {
            throw new ResourceNotFoundException("Extension missing");
        }
        String ext = uri.substring(dotIdx + 1).toLowerCase(Locale.ROOT);
        MediaType mediaType = SUPPORTED_SUFFIXES.get(ext);
        if (mediaType == null) {
            throw new ResourceNotFoundException("Unsupported format suffix: ." + ext);
        }

        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = tokenParam != null && !tokenParam.isBlank() ? tokenParam : tokenHeader;

        PasteService.TypedPastePayload payload = pasteService.getTypedPaste(
                id,
                ifNoneMatch,
                authenticatedUserId,
                password,
                clientIp,
                shareToken,
                unlockToken
        );

        VaryHeader.write(httpResponse, VaryHeader.CREDENTIALS);

        if (payload.notModified()) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(payload.etag())
                    .header(HttpHeaders.CACHE_CONTROL, payload.cacheControl())
                    .build();
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .eTag(payload.etag())
                .header(HttpHeaders.CACHE_CONTROL, payload.cacheControl())
                .body(payload.contentBytes());
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getId();
        }
        return null;
    }
}
