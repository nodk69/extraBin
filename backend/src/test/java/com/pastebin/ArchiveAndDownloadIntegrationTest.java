package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.EncryptedFilePayload;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Download and archive contract: every accepted file must be represented exactly once,
 * names must remain Unicode-correct after NFC normalization and case-folding, generated
 * collision suffixes must not collide with real filenames, and filenames must be safe in
 * both ZIP entries and Content-Disposition headers.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ArchiveAndDownloadIntegrationTest {

    private static final int MAX_ARCHIVE_BASENAME_CHARS = 200;

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RateLimiterService rateLimiterService;

    private String uid;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    private CreatePasteResponse createMulti(List<PasteFileRequest> files) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Archive " + uid,
                null,
                null,
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER,
                null,
                files);
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), CreatePasteResponse.class);
    }

    private CreatePasteResponse createSingle(String title, String content) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                title, content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.NEVER);
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), CreatePasteResponse.class);
    }

    private byte[] downloadZip(String id) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/pastes/" + id + "/download-zip"))
                .andExpect(status().isOk())
                .andReturn();
        return result.getResponse().getContentAsByteArray();
    }

    private List<ZipEntryData> readZip(byte[] bytes) throws Exception {
        List<ZipEntryData> entries = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entries.add(new ZipEntryData(entry.getName(), zis.readAllBytes()));
                zis.closeEntry();
            }
        }
        return entries;
    }

    private record ZipEntryData(String name, byte[] content) {}

    private static List<String> names(List<ZipEntryData> entries) {
        return entries.stream().map(ZipEntryData::name).toList();
    }

    private static Map<String, byte[]> byName(List<ZipEntryData> entries) {
        Map<String, byte[]> result = new LinkedHashMap<>();
        for (ZipEntryData entry : entries) {
            result.put(entry.name().toLowerCase(Locale.ROOT), entry.content());
        }
        return result;
    }

    private static Set<String> caseInsensitiveNames(List<ZipEntryData> entries) {
        Set<String> result = new HashSet<>();
        for (ZipEntryData entry : entries) {
            result.add(entry.name().toLowerCase(Locale.ROOT));
        }
        return result;
    }

    private static boolean containsUnsafeArchiveCharacters(String name) {
        if (name.contains("..")) {
            return true;
        }
        if (name.startsWith("/") || name.matches("^[A-Za-z]:.*")) {
            return true;
        }
        for (char c : name.toCharArray()) {
            if (c < 32 || c == 127 || "<>:\"/\\|?*".indexOf(c) >= 0) {
                return true;
            }
        }
        return false;
    }

    @Test
    @DisplayName("ZIP-01: Unicode names are preserved, NFC-normalized, and colliding names get deterministic suffixes")
    void zipPreservesUnicodeAndResolvesNfcCollisions() throws Exception {
        String composed = "café.txt";
        String decomposed = "cafe\u0301.txt";
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest(composed, "content-composed", "plaintext"),
                new PasteFileRequest(decomposed, "content-decomposed", "plaintext")));

        byte[] zip = downloadZip(paste.id());
        List<ZipEntryData> entries = readZip(zip);
        assertEquals(2, entries.size(), "both accepted files must be present exactly once");
        assertEquals(2, caseInsensitiveNames(entries).size(), "entry names must be unique case-insensitively");

        List<String> entryNames = names(entries);
        for (String name : entryNames) {
            assertThat(Normalizer.normalize(name, Normalizer.Form.NFC)).isEqualTo(name);
        }
        assertThat(entryNames).anyMatch(name -> name.equals("café.txt"));
        assertThat(entryNames).doesNotContain("caf_.txt", "cafe_.txt");

        Map<String, byte[]> contents = byName(entries);
        Set<String> contentSet = new HashSet<>();
        for (byte[] content : contents.values()) {
            contentSet.add(new String(content, StandardCharsets.UTF_8));
        }
        assertThat(contentSet).containsExactlyInAnyOrder("content-composed", "content-decomposed");
    }

    @Test
    @DisplayName("ZIP-02: case-folding collisions still produce one entry per accepted file")
    void zipResolvesCaseFoldingCollisions() throws Exception {
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest("A_B.txt", "upper-content", "plaintext"),
                new PasteFileRequest("a:b.txt", "colon-content", "plaintext")));

        List<ZipEntryData> entries = readZip(downloadZip(paste.id()));
        assertEquals(2, entries.size());
        assertEquals(2, caseInsensitiveNames(entries).size());

        Set<String> contents = new HashSet<>();
        for (byte[] content : byName(entries).values()) {
            contents.add(new String(content, StandardCharsets.UTF_8));
        }
        assertThat(contents).containsExactlyInAnyOrder("upper-content", "colon-content");
    }

    @Test
    @DisplayName("ZIP-03: generated suffixes cannot collide with real filenames and ordering is deterministic")
    void zipResolvesGeneratedSuffixCollisionsDeterministically() throws Exception {
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest("a:b.txt", "content-colon", "plaintext"),
                new PasteFileRequest("a?b.txt", "content-question", "plaintext"),
                new PasteFileRequest("a_b (2).txt", "content-real-suffix", "plaintext")));

        List<String> firstNames = names(readZip(downloadZip(paste.id())));
        List<String> secondNames = names(readZip(downloadZip(paste.id())));
        assertEquals(3, firstNames.size(), "all three accepted files must be present");
        assertEquals(3, firstNames.stream().map(n -> n.toLowerCase(Locale.ROOT)).distinct().count());
        assertEquals(firstNames, secondNames, "collision suffixes must be deterministic across downloads");

        List<ZipEntryData> entries = readZip(downloadZip(paste.id()));
        Set<String> contents = new HashSet<>();
        for (byte[] content : byName(entries).values()) {
            contents.add(new String(content, StandardCharsets.UTF_8));
        }
        assertThat(contents).containsExactlyInAnyOrder(
                "content-colon", "content-question", "content-real-suffix");
    }

    @Test
    @DisplayName("ZIP-04: long names are bounded and truncation collisions remain distinct")
    void zipTruncatesLongNamesAndKeepsThemDistinct() throws Exception {
        String commonPrefix = "x".repeat(220);
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest(commonPrefix + "-A.txt", "long-a", "plaintext"),
                new PasteFileRequest(commonPrefix + "-B.txt", "long-b", "plaintext")));

        List<ZipEntryData> entries = readZip(downloadZip(paste.id()));
        assertEquals(2, entries.size());
        assertEquals(2, caseInsensitiveNames(entries).size());
        for (String name : names(entries)) {
            assertThat(name.length()).isLessThanOrEqualTo(MAX_ARCHIVE_BASENAME_CHARS);
        }

        Set<String> contents = new HashSet<>();
        for (byte[] content : byName(entries).values()) {
            contents.add(new String(content, StandardCharsets.UTF_8));
        }
        assertThat(contents).containsExactlyInAnyOrder("long-a", "long-b");
    }

    @Test
    @DisplayName("ZIP-05: empty file content is accepted and represented as a zero-byte entry")
    void zipIncludesEmptyFileAsZeroByteEntry() throws Exception {
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest("empty.txt", "", "plaintext"),
                new PasteFileRequest("note.txt", "hello", "plaintext")));

        List<ZipEntryData> entries = readZip(downloadZip(paste.id()));
        assertEquals(2, entries.size());
        Map<String, byte[]> contents = byName(entries);
        assertThat(contents.get("empty.txt")).isEmpty();
        assertThat(new String(contents.get("note.txt"), StandardCharsets.UTF_8)).isEqualTo("hello");
    }

    @Test
    @DisplayName("ZIP-06: every accepted file is represented exactly once")
    void zipIncludesEveryAcceptedFileExactlyOnce() throws Exception {
        List<PasteFileRequest> files = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            files.add(new PasteFileRequest(
                    String.format("file-%02d.txt", i), "content-" + i, "plaintext"));
        }
        CreatePasteResponse paste = createMulti(files);

        List<ZipEntryData> entries = readZip(downloadZip(paste.id()));
        assertEquals(20, entries.size());
        assertEquals(20, names(entries).stream().distinct().count());

        Set<String> contents = new HashSet<>();
        for (byte[] content : byName(entries).values()) {
            contents.add(new String(content, StandardCharsets.UTF_8));
        }
        for (int i = 0; i < 20; i++) {
            assertThat(contents).contains("content-" + i);
        }
    }

    @Test
    @DisplayName("ZIP-07: entry names contain no traversal, absolute paths, or Windows-reserved characters")
    void zipEntryNamesAreSafe() throws Exception {
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest("a:b*?<>|.txt", "unsafe-chars", "plaintext")));

        List<ZipEntryData> entries = readZip(downloadZip(paste.id()));
        assertEquals(1, entries.size());
        String entryName = entries.get(0).name();
        assertThat(containsUnsafeArchiveCharacters(entryName)).isFalse();
        assertThat(entryName).doesNotContain("..");
    }

    @Test
    @DisplayName("ZIP-08: encrypted manifest names exactly match the encrypted archive entries")
    void encryptedZipManifestMatchesActualEntries() throws Exception {
        byte[] ciphertextA = "PLAINTEXT_MARKER_A".getBytes(StandardCharsets.UTF_8);
        byte[] ciphertextB = "PLAINTEXT_MARKER_B".getBytes(StandardCharsets.UTF_8);
        CreateEncryptedPasteRequest request = new CreateEncryptedPasteRequest(
                List.of(
                        encryptedFile("a:b.bin", ciphertextA),
                        encryptedFile("a?b.bin", ciphertextB)),
                "LINK",
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16},
                600000,
                nonZeroWrappedKey(),
                null,
                Visibility.PUBLIC,
                "plaintext",
                false,
                null);

        MvcResult create = mockMvc.perform(post("/api/v1/pastes/encrypted").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(create.getResponse().getContentAsString()).get("id").asText();

        List<ZipEntryData> entries = readZip(downloadZip(id));
        ZipEntryData manifestEntry = entries.stream()
                .filter(e -> e.name().equals("manifest.json"))
                .findFirst()
                .orElseThrow();
        assertThat(entries).hasSize(3);

        JsonNode manifest = objectMapper.readTree(manifestEntry.content());
        JsonNode manifestFiles = manifest.get("files");
        assertThat(manifestFiles).hasSize(2);

        Set<String> actualEntryNames = new HashSet<>();
        for (ZipEntryData entry : entries) {
            if (!entry.name().equals("manifest.json")) {
                actualEntryNames.add(entry.name().toLowerCase(Locale.ROOT));
            }
        }
        assertEquals(2, actualEntryNames.size());

        Set<String> manifestNames = new HashSet<>();
        for (JsonNode file : manifestFiles) {
            String manifestName = file.get("filename").asText();
            manifestNames.add(manifestName.toLowerCase(Locale.ROOT));
            assertThat(manifestName).endsWith(".enc");
            assertThat(file.has("content")).isFalse();
        }

        assertEquals(actualEntryNames, manifestNames,
                "manifest filenames must be the exact archive entry names");

        String serializedManifest = new String(manifestEntry.content(), StandardCharsets.UTF_8);
        assertThat(serializedManifest).doesNotContain("PLAINTEXT_MARKER_A", "PLAINTEXT_MARKER_B");
        assertThat(serializedManifest).doesNotContain("ciphertext\"");
        assertEquals(2, names(entries).stream()
                .filter(name -> !name.equals("manifest.json"))
                .map(name -> name.toLowerCase(Locale.ROOT))
                .distinct()
                .count());
    }

    private EncryptedFilePayload encryptedFile(String name, byte[] ciphertext) {
        return new EncryptedFilePayload(
                name,
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12},
                ciphertext,
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16});
    }

    private static byte[] nonZeroWrappedKey() {
        byte[] wrappedKey = new byte[60];
        for (int i = 0; i < wrappedKey.length; i++) {
            wrappedKey[i] = (byte) (i + 1);
        }
        return wrappedKey;
    }

    @Test
    @DisplayName("DOWNLOAD-01: non-ASCII download names use RFC 5987 encoding")
    void unicodeDownloadFilenameUsesRfc5987() throws Exception {
        CreatePasteResponse paste = createMulti(List.of(
                new PasteFileRequest("café.txt", "unicode-name", "plaintext")));

        MvcResult viewResult = mockMvc.perform(get("/api/v1/pastes/" + paste.id())
                        .header("X-Skip-View-Count", "true"))
                .andExpect(status().isOk())
                .andReturn();
        long fileId = objectMapper.readTree(viewResult.getResponse().getContentAsString())
                .get("files").get(0).get("id").asLong();

        MvcResult download = mockMvc.perform(
                        get("/api/v1/pastes/" + paste.id() + "/files/by-id/" + fileId + "/download"))
                .andExpect(status().isOk())
                .andReturn();

        String disposition = download.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(disposition).isNotNull();
        assertThat(disposition.toLowerCase(Locale.ROOT))
                .contains("filename*=utf-8''caf%c3%a9.txt");
    }

    @Test
    @DisplayName("DOWNLOAD-02: the active single-file download name is safe and preserves its extension")
    void singleFileDownloadNameIsSafe() throws Exception {
        CreatePasteResponse paste = createSingle("User.java", "class User {}");

        MvcResult download = mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/download"))
                .andExpect(status().isOk())
                .andReturn();

        String disposition = download.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(disposition).isEqualTo("attachment; filename=\"User.java\"");
        assertThat(new String(download.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8))
                .isEqualTo("class User {}");
    }

    @Test
    @DisplayName("DOWNLOAD-03: CR/LF in a title cannot inject a response header")
    void downloadTitleCannotInjectHeaders() throws Exception {
        CreatePasteResponse paste = createSingle("evil\r\nX-Injected: yes", "safe body");

        MvcResult download = mockMvc.perform(get("/api/v1/pastes/" + paste.id() + "/download"))
                .andExpect(status().isOk())
                .andReturn();

        String disposition = download.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(disposition).isNotNull();
        assertThat(disposition).doesNotContain("\r");
        assertThat(disposition).doesNotContain("\n");
        assertThat(download.getResponse().getHeader("X-Injected")).isNull();
    }
}
