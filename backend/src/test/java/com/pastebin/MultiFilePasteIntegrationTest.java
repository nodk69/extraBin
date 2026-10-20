package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MultiFilePasteIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("Should successfully create, view, download, and zip multi-file paste with User.java and Paste.java")
    void shouldCreateAndViewMultiFilePaste() throws Exception {
        List<PasteFileRequest> files = List.of(
                new PasteFileRequest("User.java", "public class User { private Long id; }", "java"),
                new PasteFileRequest("Paste.java", "public class Paste { private String title; }", "java")
        );

        CreatePasteRequest request = new CreatePasteRequest(
                "Spring Boot Models",
                files,
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null
        );

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.title").value("Spring Boot Models"))
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // 1. Verify Paste View includes both files
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.files").isArray())
                .andExpect(jsonPath("$.files.length()").value(2))
                .andExpect(jsonPath("$.files[0].filename").value("User.java"))
                .andExpect(jsonPath("$.files[0].content").value("public class User { private Long id; }"))
                .andExpect(jsonPath("$.files[0].language").value("java"))
                .andExpect(jsonPath("$.files[1].filename").value("Paste.java"))
                .andExpect(jsonPath("$.files[1].content").value("public class Paste { private String title; }"))
                .andExpect(jsonPath("$.files[1].language").value("java"));

        // 2. Verify per-file raw content
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/User.java/raw"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().string("public class User { private Long id; }"));

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/Paste.java/raw"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().string("public class Paste { private String title; }"));

        // 3. Verify per-file individual download
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/User.java/download"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"User.java\""))
                .andExpect(content().string("public class User { private Long id; }"));

        // 4. Verify ZIP archive download containing all files
        MvcResult zipResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download-zip"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString(".zip")))
                .andExpect(content().contentType(MediaType.parseMediaType("application/zip")))
                .andReturn();

        byte[] zipBytes = zipResult.getResponse().getContentAsByteArray();
        assertThat(zipBytes).isNotEmpty();

        List<String> entryNames = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryNames.add(entry.getName());
                zis.closeEntry();
            }
        }
        assertThat(entryNames).containsExactlyInAnyOrder("User.java", "Paste.java");
    }

    @Test
    @DisplayName("Should reject multi-file submission with duplicate filenames")
    void shouldRejectDuplicateFilenames() throws Exception {
        List<PasteFileRequest> files = List.of(
                new PasteFileRequest("User.java", "int a = 1;", "java"),
                new PasteFileRequest("user.java", "int b = 2;", "java") // Case-insensitive duplicate
        );

        CreatePasteRequest request = new CreatePasteRequest(
                "Duplicate Filename Test",
                files,
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("Duplicate filename")));
    }

    @Test
    @DisplayName("Should reject path traversal characters in filenames")
    void shouldRejectPathTraversalInFilename() throws Exception {
        List<PasteFileRequest> files = List.of(
                new PasteFileRequest("../etc/passwd", "malicious content", "plaintext")
        );

        CreatePasteRequest request = new CreatePasteRequest(
                "Path Traversal Test",
                files,
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("directory traversal")));
    }

    @Test
    @DisplayName("Should reject paste exceeding 20 files limit")
    void shouldRejectTooManyFiles() throws Exception {
        List<PasteFileRequest> files = new ArrayList<>();
        for (int i = 0; i < 21; i++) {
            files.add(new PasteFileRequest("file_" + i + ".txt", "content " + i, "plaintext"));
        }

        CreatePasteRequest request = new CreatePasteRequest(
                "Too Many Files Test",
                files,
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("cannot contain more than 20 files")));
    }

    @Test
    @DisplayName("Should reject file containing binary NUL bytes")
    void shouldRejectBinaryContentWithNulByte() throws Exception {
        List<PasteFileRequest> files = List.of(
                new PasteFileRequest("binary.bin", "text before \u0000 binary payload", "plaintext")
        );

        CreatePasteRequest request = new CreatePasteRequest(
                "Binary Upload Attempt",
                files,
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("contains binary (NUL byte) content")));
    }
}
