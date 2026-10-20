package com.pastebin.paste.api;

import com.pastebin.paste.api.dto.PasteMetadataHtmlResponse;
import com.pastebin.paste.application.PasteService;
import com.pastebin.shared.http.VaryHeader;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

import java.time.Duration;
import java.time.Instant;

@RestController
@Tag(name = "Paste Metadata", description = "Serves safe Open Graph metadata HTML for canonical paste URLs")
public class PasteMetadataController {

    private final PasteService pasteService;

    public PasteMetadataController(PasteService pasteService) {
        this.pasteService = pasteService;
    }

    @GetMapping(value = "/p/{id}", produces = MediaType.TEXT_HTML_VALUE)
    @Operation(summary = "Get Open Graph HTML metadata for public paste",
               description = "Renders canonical URL, Open Graph metadata and minimal HTML shell for social crawlers.")
    public ResponseEntity<String> getMetadataHtml(
            @PathVariable("id") String id,
            HttpServletResponse httpResponse
    ) {
        PasteMetadataHtmlResponse metadata = pasteService.getPasteMetadataHtml(id);

        long maxAge = 86400L;
        if (metadata.expiresAt() != null) {
            long remaining = Duration.between(Instant.now(), metadata.expiresAt()).toSeconds();
            maxAge = Math.max(0, Math.min(86400L, remaining));
        }

        String base = pasteService.getPublicBaseUrl();
        String canonicalUrl = base + "/p/" + metadata.publicId();

        String rawTitle = (metadata.title() != null && !metadata.title().isBlank())
                ? metadata.title()
                : "Paste " + metadata.publicId();

        String safeTitle = HtmlUtils.htmlEscape(rawTitle);
        String safeDescription = HtmlUtils.htmlEscape("View paste " + metadata.publicId() + " on ExtraBin");
        String safeCanonicalUrl = HtmlUtils.htmlEscape(canonicalUrl);

        String html = "<!DOCTYPE html>\n" +
                "<html lang=\"en\">\n" +
                "<head>\n" +
                "    <meta charset=\"UTF-8\">\n" +
                "    <title>" + safeTitle + "</title>\n" +
                "    <link rel=\"canonical\" href=\"" + safeCanonicalUrl + "\" />\n" +
                "    <meta property=\"og:url\" content=\"" + safeCanonicalUrl + "\" />\n" +
                "    <meta property=\"og:title\" content=\"" + safeTitle + "\" />\n" +
                "    <meta property=\"og:description\" content=\"" + safeDescription + "\" />\n" +
                "    <meta name=\"twitter:card\" content=\"summary\" />\n" +
                "    <link rel=\"stylesheet\" href=\"/assets/app.css\" />\n" +
                "</head>\n" +
                "<body>\n" +
                "    <div id=\"root\"></div>\n" +
                "    <script type=\"module\" src=\"/assets/app.js\"></script>\n" +
                "</body>\n" +
                "</html>";

        VaryHeader.write(httpResponse, VaryHeader.CREDENTIALS);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "text/html;charset=UTF-8")
                .header("X-Content-Type-Options", "nosniff")
                .header("X-Robots-Tag", "noindex, nofollow")
                .header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.CACHE_CONTROL, "public, must-revalidate, max-age=" + maxAge)
                .body(html);
    }
}
