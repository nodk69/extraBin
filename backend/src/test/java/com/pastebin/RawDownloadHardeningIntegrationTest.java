package com.pastebin;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE tests for raw/download/ZIP authorization, filename safety, and archive bounds.
 */
class RawDownloadHardeningIntegrationTest extends ShareTestSupport {

    private String publicPaste() throws Exception {
        return createPasteViaApi("Raw fixture", "raw body", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);
    }

    private long firstFileId(String pasteId) throws Exception {
        String body = mockMvc.perform(get("/api/v1/pastes/{id}", pasteId))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body).get("files").get(0).get("id").asLong();
    }

    // ---------------------------------------------------------------------
    // Raw content authorization
    // ---------------------------------------------------------------------

    @Test
    void raw_publicPaste_returnsPlaintextWithNosniff() throws Exception {
        String id = publicPaste();

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().string("raw body"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void raw_unlisted_withoutToken_returns404() throws Exception {
        String id = persistUnlisted("raw_unlisted", "shr_" + "f".repeat(43),
                com.pastebin.paste.domain.ShareAccessState.ACTIVE);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void raw_private_nonOwner_returns404() throws Exception {
        String id = persistPaste("raw_private", "Private raw", "private",
                Visibility.PRIVATE, null, false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void raw_expired_returns404() throws Exception {
        String id = persistPaste("raw_expired", "Expired raw", "gone",
                Visibility.PUBLIC, null, false, null, Instant.now().minus(1, ChronoUnit.MINUTES), null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void raw_passwordMissing_returnsUniform404() throws Exception {
        String id = persistPaste("raw_pw_missing", "Password raw", "secret",
                Visibility.PUBLIC, "raw-secret", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void raw_passwordWrong_returns401() throws Exception {
        String id = persistPaste("raw_pw_wrong", "Password raw", "secret",
                Visibility.PUBLIC, "raw-secret", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Password", "wrong"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void raw_burnAfterReading_firstRead200_second404() throws Exception {
        String id = createPasteViaApi("Burn raw", "burn once", Visibility.PUBLIC,
                ExpirationPolicy.BURN_AFTER_READING, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id)).andExpect(status().isNotFound());
    }

    @Test
    void raw_encrypted_returnsEncryptedJson() throws Exception {
        String id = persistEncrypted("raw_encrypted");

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("X-ExtraBin-Encryption", "LINK"));
    }

    @Test
    void rawFile_unknownFilename_returns404() throws Exception {
        String id = createMultiFilePasteViaApi("Raw files", List.of("a.txt"), List.of("a-body"),
                Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/files/nope.txt/raw", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void rawFile_crossPasteFileId_returns404() throws Exception {
        String first = createMultiFilePasteViaApi("First paste", List.of("a.txt"), List.of("a-body"),
                Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);
        String second = createMultiFilePasteViaApi("Second paste", List.of("b.txt"), List.of("b-body"),
                Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);
        long firstFileId = firstFileId(first);

        mockMvc.perform(get("/api/v1/pastes/{id}/files/by-id/{fileId}/raw", second, firstFileId))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------------
    // Download filename safety
    // ---------------------------------------------------------------------

    @Test
    void download_unicodeFilename_usesRfc5987() throws Exception {
        String id = persistPaste("dl_unicode", "Unicode filename", "body", Visibility.PUBLIC,
                null, false, null, null, List.of("héllo wörld.txt"), List.of("body"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("filename*=UTF-8''")))
                .andReturn();

        assertThat(contentDispositionFilename(result)).isEqualTo("héllo wörld.txt");
    }

    @Test
    void download_crlfFilename_isSanitized() throws Exception {
        String id = persistPaste("dl_crlf", "CRLF filename", "body", Visibility.PUBLIC,
                null, false, null, null, List.of("evil\r\nX-Injected: yes.txt"), List.of("body"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk())
                .andReturn();

        String header = result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(header).doesNotContain("\r").doesNotContain("\n");
        assertThat(result.getResponse().getHeaders(HttpHeaders.CONTENT_DISPOSITION)).hasSize(1);
        assertThat(contentDispositionFilename(result)).doesNotContain("\r").doesNotContain("\n");
    }

    @Test
    void download_windowsReservedName_isPrefixed() throws Exception {
        String id = persistPaste("dl_reserved", "Reserved filename", "body", Visibility.PUBLIC,
                null, false, null, null, List.of("CON.txt"), List.of("body"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(contentDispositionFilename(result)).startsWith("extra-bin-");
    }

    @Test
    void download_pathTraversalFilename_isSanitized() throws Exception {
        String id = persistPaste("dl_traversal", "Traversal filename", "body", Visibility.PUBLIC,
                null, false, null, null, List.of("../../etc/passwd"), List.of("body"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk())
                .andReturn();

        String filename = contentDispositionFilename(result);
        assertThat(filename).doesNotContain("..").doesNotContain("/").doesNotContain("\\");
    }

    @Test
    void download_quotedFilename_doesNotInjectParameters() throws Exception {
        String id = persistPaste("dl_quotes", "Quoted filename", "body", Visibility.PUBLIC,
                null, false, null, null, List.of("a\"; filename=\"b.txt"), List.of("body"));

        mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        not(containsString("\"; filename=\""))));
    }

    @Test
    void download_protectedPaste_setsVaryHeaders() throws Exception {
        String id = persistPaste("dl_protected_vary", "Protected download", "secret", Visibility.PUBLIC,
                "download-secret", false, null, null, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/download", id).header("X-Paste-Password", "download-secret"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string(HttpHeaders.VARY, containsString("X-Paste-Password")));
    }

    // ---------------------------------------------------------------------
    // ZIP archive contract and resource bounds
    // ---------------------------------------------------------------------

    @Test
    void downloadZip_publicMultiFile_isDeterministicAndSafe() throws Exception {
        String id = createMultiFilePasteViaApi("Zip fixture", List.of("a.txt", "b.txt"),
                List.of("a-body", "b-body"), Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.parseMediaType("application/zip")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn();

        assertThat(zipEntryNames(result.getResponse().getContentAsByteArray()))
                .containsExactly("a.txt", "b.txt");
    }

    @Test
    void downloadZip_unicodeFilenames_preserved() throws Exception {
        String id = persistPaste("zip_unicode", "Unicode zip", null, Visibility.PUBLIC,
                null, false, null, null, List.of("héllo.txt", "日本語.txt"), List.of("a", "b"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(zipEntryNames(result.getResponse().getContentAsByteArray()))
                .contains("héllo.txt", "日本語.txt");
    }

    @Test
    void downloadZip_duplicateFilenames_areDeduplicatedDeterministically() throws Exception {
        String id = persistPaste("zip_dupes", "Duplicate zip", null, Visibility.PUBLIC,
                null, false, null, null, List.of("a.txt", "A.TXT"), List.of("first", "second"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isOk())
                .andReturn();

        List<String> names = zipEntryNames(result.getResponse().getContentAsByteArray());
        assertThat(names).hasSize(2);
        assertThat(names.get(0)).isEqualTo("a.txt");
        assertThat(names.get(1)).matches("(?i)a \\(2\\)\\.txt");
    }

    @Test
    void downloadZip_traversalFilenames_areNeutralized() throws Exception {
        String id = persistPaste("zip_traversal", "Traversal zip", null, Visibility.PUBLIC,
                null, false, null, null,
                List.of("../../etc/passwd", "C:\\evil.txt", "/abs.txt"),
                List.of("a", "b", "c"));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isOk())
                .andReturn();

        for (String name : zipEntryNames(result.getResponse().getContentAsByteArray())) {
            assertThat(name).doesNotContain("..").doesNotContain("/").doesNotContain("\\").doesNotContain(":");
            assertThat(name).doesNotStartWith("/");
        }
    }

    @Test
    void downloadZip_exceedsEntryCap_returns413() throws Exception {
        String id = persistPaste("zip_entries", "Entry cap", null, Visibility.PUBLIC,
                null, false, null, null,
                List.of("a.txt", "b.txt", "c.txt", "d.txt"),
                List.of("a", "b", "c", "d"));

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("ARCHIVE_TOO_LARGE"));
    }

    @Test
    void downloadZip_exceedsByteCap_returns413() throws Exception {
        String payload = "x".repeat(3_000);
        String id = persistPaste("zip_bytes", "Byte cap", null, Visibility.PUBLIC,
                null, false, null, null, List.of("a.txt", "b.txt"), List.of(payload, payload));

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("ARCHIVE_TOO_LARGE"));
    }

    @Test
    void downloadZip_exceedsCompressedOutputCap_returns413() throws Exception {
        byte[] random = new byte[3_000];
        new java.util.Random(42).nextBytes(random);
        String incompressible = java.util.Base64.getEncoder().encodeToString(random);
        String id = persistPaste("zip_output", "Output cap", null, Visibility.PUBLIC,
                null, false, null, null, List.of("random.bin.txt"), List.of(incompressible));

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("ARCHIVE_TOO_LARGE"));
    }

    @Test
    void downloadZip_atCaps_succeeds() throws Exception {
        String payload = "x".repeat(1_000);
        String id = persistPaste("zip_at_cap", "At cap", null, Visibility.PUBLIC,
                null, false, null, null,
                List.of("a.txt", "b.txt", "c.txt"), List.of(payload, payload, payload));

        MvcResult result = mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(zipEntryNames(result.getResponse().getContentAsByteArray())).hasSize(3);
    }

    @Test
    void downloadZip_passwordMissing_returnsUniform404() throws Exception {
        String id = persistPaste("zip_pw_missing", "Password zip", null, Visibility.PUBLIC,
                "zip-secret", false, null, null, List.of("a.txt"), List.of("a"));

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void downloadZip_passwordWrong_returns401() throws Exception {
        String id = persistPaste("zip_pw_wrong", "Password zip", null, Visibility.PUBLIC,
                "zip-secret", false, null, null, List.of("a.txt"), List.of("a"));

        mockMvc.perform(get("/api/v1/pastes/{id}/download-zip", id).header("X-Paste-Password", "wrong"))
                .andExpect(status().isUnauthorized());
    }
}
