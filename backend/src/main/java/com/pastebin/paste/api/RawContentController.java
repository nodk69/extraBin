package com.pastebin.paste.api;

import com.pastebin.paste.application.PasteService;
import com.pastebin.shared.http.VaryHeader;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/v1/pastes/{id}")
@Tag(name = "Raw & Download", description = "Endpoints for raw text views and file downloads")
public class RawContentController {

    private final PasteService pasteService;
    private final com.pastebin.shared.security.ClientIpResolver clientIpResolver;

    public RawContentController(PasteService pasteService, com.pastebin.shared.security.ClientIpResolver clientIpResolver) {
        this.pasteService = pasteService;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping("/raw")
    @Operation(summary = "Get raw paste content", description = "Returns plain text content or encrypted payload with UTF-8/octet-stream encoding, nosniff, and private cache-control.")
    public ResponseEntity<byte[]> getRawContent(
            @PathVariable("id") String id,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.RawPayload payload = pasteService.getRawPayload(id, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        VaryHeader.write(httpResponse, VaryHeader.CREDENTIALS, "Accept-Encoding");

        var responseBuilder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate");

        if (payload.encryptionMode() != null) {
            return responseBuilder
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-ExtraBin-Encryption", payload.encryptionMode().name())
                    .body(payload.bytes());
        }

        return responseBuilder
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(payload.bytes());
    }

    @GetMapping("/files/{filename}/raw")
    @Operation(summary = "Get raw content of a specific file in the paste", description = "Returns plain text or raw ciphertext of an individual file in a multi-file paste.")
    public ResponseEntity<byte[]> getRawFileContent(
            @PathVariable("id") String id,
            @PathVariable("filename") String filename,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.RawPayload payload = pasteService.getRawFilePayload(id, filename, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        var responseBuilder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate");

        if (payload.encryptionMode() != null) {
            return responseBuilder
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header("X-ExtraBin-Encryption", payload.encryptionMode().name())
                    .body(payload.bytes());
        }

        return responseBuilder
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(payload.bytes());
    }

    @GetMapping("/download")
    @Operation(summary = "Download paste content as a file", description = "Downloads paste content with sanitized filename and attachment disposition.")
    public ResponseEntity<byte[]> downloadContent(
            @PathVariable("id") String id,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.DownloadData data = pasteService.getDownloadData(id, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        org.springframework.http.ContentDisposition cd = org.springframework.http.ContentDisposition.attachment()
                .filename(data.filename())
                .build();

        VaryHeader.write(httpResponse, VaryHeader.CREDENTIALS);

        var responseBuilder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate");

        if (data.encryptionMode() != null) {
            responseBuilder.contentType(MediaType.APPLICATION_JSON);
            responseBuilder.header("X-ExtraBin-Encryption", data.encryptionMode().name());
        } else {
            responseBuilder.contentType(MediaType.APPLICATION_OCTET_STREAM);
        }

        return responseBuilder.body(data.getPayloadBytes());
    }

    @GetMapping("/files/{filename}/download")
    @Operation(summary = "Download a specific file from the paste", description = "Downloads an individual file with safe filename attachment disposition.")
    public ResponseEntity<byte[]> downloadFile(
            @PathVariable("id") String id,
            @PathVariable("filename") String filename,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.DownloadData data = pasteService.getDownloadFileData(id, filename, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        org.springframework.http.ContentDisposition cd = org.springframework.http.ContentDisposition.attachment()
                .filename(data.filename())
                .build();

        var responseBuilder = ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate");

        if (data.encryptionMode() != null) {
            responseBuilder.header("X-ExtraBin-Encryption", data.encryptionMode().name());
        }

        return responseBuilder.body(data.getPayloadBytes());
    }

    @GetMapping("/files/by-id/{fileId}/raw")
    @Operation(summary = "Get raw content of a specific file by its numeric ID", description = "Returns plain text or raw ciphertext of an individual file using its immutable database ID.")
    public ResponseEntity<byte[]> getRawFileContentById(
            @PathVariable("id") String id,
            @PathVariable("fileId") Long fileId,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.RawPayload payload = pasteService.getRawFilePayloadById(id, fileId, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        var responseBuilder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate");

        if (payload.encryptionMode() != null) {
            return responseBuilder
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .header("X-ExtraBin-Encryption", payload.encryptionMode().name())
                    .body(payload.bytes());
        }

        return responseBuilder
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(payload.bytes());
    }

    @GetMapping("/files/by-id/{fileId}/download")
    @Operation(summary = "Download a specific file by its numeric ID", description = "Downloads an individual file with safe filename attachment disposition using its immutable database ID.")
    public ResponseEntity<byte[]> downloadFileById(
            @PathVariable("id") String id,
            @PathVariable("fileId") Long fileId,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.DownloadData data = pasteService.getDownloadFileDataById(id, fileId, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        org.springframework.http.ContentDisposition cd = org.springframework.http.ContentDisposition.attachment()
                .filename(data.filename())
                .build();

        var responseBuilder = ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate");

        if (data.encryptionMode() != null) {
            responseBuilder.header("X-ExtraBin-Encryption", data.encryptionMode().name());
        }

        return responseBuilder.body(data.getPayloadBytes());
    }

    @GetMapping("/download-zip")
    @Operation(summary = "Download all files in the paste as a ZIP archive", description = "Archives all paste files into a zip package with safe paths.")
    public ResponseEntity<byte[]> downloadZip(
            @PathVariable("id") String id,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Share-Token", required = false) String tokenHeader,
            @RequestHeader(value = "X-Paste-Password", required = false) String password,
            @RequestHeader(value = "X-Paste-Unlock", required = false) String unlockToken,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest httpRequest
    ) {
        Long authenticatedUserId = extractUserId(principal);
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String shareToken = (tokenParam != null && !tokenParam.isBlank()) ? tokenParam : tokenHeader;
        PasteService.ZipDownloadData zipData = pasteService.getZipDownloadData(id, authenticatedUserId, password, clientIp, shareToken, unlockToken);

        org.springframework.http.ContentDisposition cd = org.springframework.http.ContentDisposition.attachment()
                .filename(zipData.filename())
                .build();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, must-revalidate")
                .body(zipData.zipBytes());
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof com.pastebin.identity.infrastructure.PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getId();
        }
        return null;
    }
}
