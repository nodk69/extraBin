package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
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
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Empty-file contract: a missing/null content field is invalid, but a present empty string is
 * a valid zero-byte file and must survive validation, view serialization, raw, download, and
 * archive generation without being coerced to null or rejected as blank.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EmptyFileCreationIntegrationTest {

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

    private MvcResult create(List<PasteFileRequest> files) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Empty file " + uid,
                null,
                null,
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER,
                null,
                files);
        return mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andReturn();
    }

    private CreatePasteResponse createAccepted(List<PasteFileRequest> files) throws Exception {
        MvcResult result = create(files);
        assertEquals(201, result.getResponse().getStatus());
        return objectMapper.readValue(
                result.getResponse().getContentAsString(), CreatePasteResponse.class);
    }

    @Test
    @DisplayName("EMPTY-01: empty and whitespace-only file content is accepted and preserved exactly")
    void emptyAndWhitespaceContent_isAcceptedAndPreserved() throws Exception {
        CreatePasteResponse created = createAccepted(List.of(
                new PasteFileRequest("empty.txt", "", "plaintext"),
                new PasteFileRequest("spaces.txt", "  \n\t", "plaintext"),
                new PasteFileRequest("note.txt", "hello", "plaintext")));

        MvcResult view = mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Skip-View-Count", "true"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode json = objectMapper.readTree(view.getResponse().getContentAsString());
        JsonNode files = json.get("files");
        assertEquals(3, files.size());

        Map<String, JsonNode> byName = new LinkedHashMap<>();
        for (JsonNode file : files) {
            byName.put(file.get("filename").asText(), file);
        }

        assertThat(byName.get("empty.txt").get("content").asText()).isEmpty();
        assertThat(byName.get("empty.txt").get("sizeBytes").asInt()).isZero();
        assertThat(byName.get("spaces.txt").get("content").asText()).isEqualTo("  \n\t");
        assertThat(byName.get("spaces.txt").get("sizeBytes").asInt()).isEqualTo(4);
        assertThat(byName.get("note.txt").get("content").asText()).isEqualTo("hello");
    }

    @Test
    @DisplayName("EMPTY-02: null file content is rejected while an empty string is accepted")
    void nullContent_isRejectedButEmptyStringIsAccepted() throws Exception {
        String nullPayload = """
                {
                  "title": "Null content %s",
                  "visibility": "PUBLIC",
                  "expiration": "NEVER",
                  "files": [{"filename": "null.txt", "content": null, "language": "plaintext"}]
                }
                """.formatted(uid);

        mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(nullPayload))
                .andExpect(status().isBadRequest());

        String missingPayload = """
                {
                  "title": "Missing content %s",
                  "visibility": "PUBLIC",
                  "expiration": "NEVER",
                  "files": [{"filename": "missing.txt", "language": "plaintext"}]
                }
                """.formatted(uid);

        mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(missingPayload))
                .andExpect(status().isBadRequest());

        createAccepted(List.of(new PasteFileRequest("empty.txt", "", "plaintext")));
    }

    @Test
    @DisplayName("EMPTY-03: the legacy single-content field still rejects blank input")
    void legacyBlankSingleContent_isRejected() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Legacy blank " + uid,
                "   \n\t",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.NEVER);

        mockMvc.perform(post("/api/v1/pastes").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("EMPTY-04: empty files return zero bytes from raw and individual download")
    void emptyFileRawAndDownload_areZeroBytes() throws Exception {
        CreatePasteResponse created = createAccepted(List.of(
                new PasteFileRequest("empty.txt", "", "plaintext"),
                new PasteFileRequest("content.txt", "payload", "plaintext")));

        MvcResult view = mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Skip-View-Count", "true"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode files = objectMapper.readTree(view.getResponse().getContentAsString()).get("files");
        long emptyId = -1;
        for (JsonNode file : files) {
            if ("empty.txt".equals(file.get("filename").asText())) {
                emptyId = file.get("id").asLong();
            }
        }
        assertThat(emptyId).isNotEqualTo(-1L);

        MvcResult raw = mockMvc.perform(
                        get("/api/v1/pastes/" + created.id() + "/files/by-id/" + emptyId + "/raw"))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(0, raw.getResponse().getContentAsByteArray().length);

        MvcResult download = mockMvc.perform(
                        get("/api/v1/pastes/" + created.id() + "/files/by-id/" + emptyId + "/download"))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(0, download.getResponse().getContentAsByteArray().length);
        assertThat(download.getResponse().getHeader("Content-Disposition")).contains("empty.txt");
    }

    @Test
    @DisplayName("EMPTY-05: an empty file is not a missing paste and remains discoverable through view/raw")
    void emptySingleFilePaste_remainsReadable() throws Exception {
        CreatePasteResponse created = createAccepted(List.of(
                new PasteFileRequest("empty-only.txt", "", "plaintext")));

        MvcResult raw = mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/raw"))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(0, raw.getResponse().getContentAsByteArray().length);

        MvcResult view = mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Skip-View-Count", "true"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode json = objectMapper.readTree(view.getResponse().getContentAsString());
        assertEquals("", json.get("files").get(0).get("content").asText());
        assertThat(new String(raw.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8))
                .isEmpty();
    }
}
