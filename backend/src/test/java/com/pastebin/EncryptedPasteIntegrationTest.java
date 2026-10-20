package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.EncryptedFilePayload;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EncryptedPasteIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        rateLimiterService.clear();
    }

    private EncryptedFilePayload createDummyFile(String hint, byte[] ciphertext) {
        return createDummyFileWithNonce(hint, ciphertext, new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12});
    }

    private EncryptedFilePayload createDummyFileWithNonce(String hint, byte[] ciphertext, byte[] nonce) {
        byte[] authTag = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}; // 16 bytes
        return new EncryptedFilePayload(hint, nonce, ciphertext, authTag);
    }

    private CreateEncryptedPasteRequest createLinkRequest(List<EncryptedFilePayload> files, boolean burnAfterReading) {
        byte[] kdfSalt = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}; // 16 bytes
        byte[] wrappedKey = new byte[60]; // 60 bytes (12 nonce + 32 key + 16 tag)
        for (int i = 0; i < 60; i++) wrappedKey[i] = (byte) (i + 1);

        return new CreateEncryptedPasteRequest(
                files,
                "LINK",
                kdfSalt,
                600000,
                wrappedKey,
                null,
                Visibility.PUBLIC,
                "typescript",
                burnAfterReading,
                null
        );
    }

    private CreateEncryptedPasteRequest createPassphraseRequest(List<EncryptedFilePayload> files, boolean burnAfterReading) {
        byte[] kdfSalt = new byte[]{10, 20, 30, 40, 50, 60, 70, 80, 11, 21, 31, 41, 51, 61, 71, 81}; // 16 bytes

        return new CreateEncryptedPasteRequest(
                files,
                "PASSPHRASE",
                kdfSalt,
                600000,
                null, // wrappedKey must be null for PASSPHRASE mode
                null,
                Visibility.PUBLIC,
                "plaintext",
                burnAfterReading,
                null
        );
    }

    @Test
    void createAndGet_linkMode_persistsCiphertextAndOmitsPlaintext() throws Exception {
        byte[] ciphertext = new byte[]{0x10, 0x20, 0x30, 0x40, 0x50};
        CreateEncryptedPasteRequest req = createLinkRequest(List.of(createDummyFile("secret.ts", ciphertext)), false);

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.encryptionMode").value("LINK"))
                .andReturn();

        JsonNode createdNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String pasteId = createdNode.get("id").asText();

        // Fetch paste view
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.encryptionMode").value("LINK"))
                .andExpect(jsonPath("$.kdfSalt").isNotEmpty())
                .andExpect(jsonPath("$.kdfIterations").value(600000))
                .andExpect(jsonPath("$.wrappedKey").isNotEmpty())
                .andExpect(jsonPath("$.content").doesNotExist()) // Plaintext MUST NOT exist
                .andExpect(jsonPath("$.files[0].ciphertext").isNotEmpty())
                .andExpect(jsonPath("$.files[0].nonce").isNotEmpty())
                .andExpect(jsonPath("$.files[0].authTag").isNotEmpty())
                .andExpect(jsonPath("$.files[0].content").doesNotExist());

        // Verify entity in DB has NULL content
        var entity = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(entity.getContent()).isNull();
        assertThat(entity.getFiles().get(0).getContent()).isNull();
        assertThat(entity.getFiles().get(0).getCiphertext()).isEqualTo(ciphertext);
        assertThat(entity.getFiles().get(0).getCiphertextSha256()).isNotNull();
    }

    @Test
    void createAndGet_passphraseMode_wrappedKeyIsNull() throws Exception {
        byte[] ciphertext = new byte[]{0x01, 0x02, 0x03};
        CreateEncryptedPasteRequest req = createPassphraseRequest(List.of(createDummyFile("vault.txt", ciphertext)), false);

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.encryptionMode").value("PASSPHRASE"))
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.encryptionMode").value("PASSPHRASE"))
                .andExpect(jsonPath("$.wrappedKey").doesNotExist())
                .andExpect(jsonPath("$.content").doesNotExist());
    }

    @Test
    void linkMode_withoutWrappedKey_isValid() throws Exception {
        byte[] kdfSalt = new byte[16];
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createDummyFile("raw_link.txt", new byte[]{1, 2, 3})),
                "LINK",
                kdfSalt,
                600000,
                null, // raw link key: wrappedKey is null
                null,
                Visibility.UNLISTED,
                null,
                false,
                null
        );

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.encryptionMode").value("LINK"));
    }

    @Test
    void linkMode_withWrongWrappedKeyLength_isRejected() throws Exception {
        byte[] kdfSalt = new byte[16];
        // 32 bytes instead of 60
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createDummyFile("wrong_len.txt", new byte[]{1, 2})),
                "LINK",
                kdfSalt,
                600000,
                new byte[32],
                null,
                Visibility.UNLISTED,
                null,
                false,
                null
        );

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void linkMode_withZeroNonceWrappedKey_isRejected() throws Exception {
        byte[] kdfSalt = new byte[16];
        byte[] wrappedKeyWithZeroNonce = new byte[60];
        // First 12 bytes are 0 (zero nonce). Non-zero tag at index 50:
        wrappedKeyWithZeroNonce[50] = 1;

        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createDummyFile("zero_nonce.txt", new byte[]{1, 2})),
                "LINK",
                kdfSalt,
                600000,
                wrappedKeyWithZeroNonce,
                null,
                Visibility.UNLISTED,
                null,
                false,
                null
        );

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void linkMode_withZeroTagWrappedKey_isRejected() throws Exception {
        byte[] kdfSalt = new byte[16];
        byte[] wrappedKeyWithZeroTag = new byte[60];
        // Non-zero nonce at index 0:
        wrappedKeyWithZeroTag[0] = 1;
        // Last 16 bytes (indices 44..59) are all zeros (zero tag)

        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createDummyFile("zero_tag.txt", new byte[]{1, 2})),
                "LINK",
                kdfSalt,
                600000,
                wrappedKeyWithZeroTag,
                null,
                Visibility.UNLISTED,
                null,
                false,
                null
        );

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void passphraseMode_rejectsNonNullWrappedKey() throws Exception {
        byte[] kdfSalt = new byte[16];
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createDummyFile("test.txt", new byte[]{1, 2})),
                "PASSPHRASE",
                kdfSalt,
                600000,
                new byte[60], // Wrapped key must be null for passphrase mode
                null,
                Visibility.UNLISTED,
                null,
                false,
                null
        );

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void discoveryFeed_neverIncludesEncryptedPastes() throws Exception {
        // Create a PUBLIC passphrase-encrypted paste
        CreateEncryptedPasteRequest req = createPassphraseRequest(List.of(createDummyFile("public_secret.txt", new byte[]{5, 6, 7})), false);
        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // Check discovery feed
        MvcResult discoveryResult = mockMvc.perform(get("/api/v1/discovery"))
                .andExpect(status().isOk())
                .andReturn();

        String discoveryContent = discoveryResult.getResponse().getContentAsString();
        assertThat(discoveryContent).doesNotContain(pasteId);
    }

    @Test
    void embedEndpoint_forbiddenForEncryptedPastes() throws Exception {
        CreateEncryptedPasteRequest req = createPassphraseRequest(List.of(createDummyFile("embed_test.txt", new byte[]{1, 2})), false);
        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/embed"))
                .andExpect(status().isForbidden());
    }

    @Test
    void commentsEndpoint_badRequestForEncryptedPastes() throws Exception {
        CreateEncryptedPasteRequest req = createPassphraseRequest(List.of(createDummyFile("comments_test.txt", new byte[]{1, 2})), false);
        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rawEndpoint_returnsJsonEnvelopeWithHeader() throws Exception {
        byte[] expectedCiphertext = new byte[]{0x12, 0x34, 0x56, 0x78};
        CreateEncryptedPasteRequest req = createLinkRequest(List.of(createDummyFile("raw_test.txt", expectedCiphertext)), false);
        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        MvcResult rawResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", MediaType.APPLICATION_JSON_VALUE))
                .andExpect(header().string("X-ExtraBin-Encryption", "LINK"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn();

        // Parse JSON bundle envelope and decode ciphertext
        JsonNode bundle = objectMapper.readTree(rawResult.getResponse().getContentAsByteArray());
        assertThat(bundle.get("format").asText()).isEqualTo("extra:enc-bundle:v1");
        assertThat(bundle.get("pasteId").asText()).isEqualTo(pasteId);
        assertThat(bundle.get("encryptionMode").asText()).isEqualTo("LINK");
        assertThat(bundle.get("kdfSalt").asText()).isNotEmpty();
        assertThat(bundle.get("kdfIterations").asInt()).isEqualTo(600000);
        assertThat(bundle.get("wrappedKey").asText()).isNotEmpty();
        assertThat(bundle.get("files")).hasSize(1);

        byte[] parsedCiphertext = Base64.getDecoder().decode(bundle.get("files").get(0).get("ciphertext").asText());
        assertThat(parsedCiphertext).isEqualTo(expectedCiphertext);
    }

    @Test
    void downloadEndpoint_returnsAttachmentWithHeader() throws Exception {
        byte[] expectedCiphertext = new byte[]{0x42, 0x43, 0x44};
        CreateEncryptedPasteRequest req = createLinkRequest(List.of(createDummyFile("dl.txt", expectedCiphertext)), false);
        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        MvcResult dlResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", MediaType.APPLICATION_JSON_VALUE))
                .andExpect(header().string("X-ExtraBin-Encryption", "LINK"))
                .andExpect(header().exists("Content-Disposition"))
                .andReturn();

        // Parse JSON bundle envelope and decode ciphertext
        JsonNode bundle = objectMapper.readTree(dlResult.getResponse().getContentAsByteArray());
        assertThat(bundle.get("format").asText()).isEqualTo("extra:enc-bundle:v1");
        assertThat(bundle.get("pasteId").asText()).isEqualTo(pasteId);
        assertThat(bundle.get("encryptionMode").asText()).isEqualTo("LINK");
        assertThat(bundle.get("files")).hasSize(1);

        byte[] parsedCiphertext = Base64.getDecoder().decode(bundle.get("files").get(0).get("ciphertext").asText());
        assertThat(parsedCiphertext).isEqualTo(expectedCiphertext);
    }

    @Test
    void rawEndpoint_twoFiles_presentsBothWithDistinctNonces() throws Exception {
        byte[] file1Data = new byte[]{1, 2, 3};
        byte[] file2Data = new byte[]{4, 5, 6};
        byte[] nonce1 = new byte[]{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
        byte[] nonce2 = new byte[]{2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2};

        CreateEncryptedPasteRequest req = createLinkRequest(List.of(
                createDummyFileWithNonce("file1.ts", file1Data, nonce1),
                createDummyFileWithNonce("file2.ts", file2Data, nonce2)
        ), false);

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        MvcResult rawResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode bundle = objectMapper.readTree(rawResult.getResponse().getContentAsByteArray());
        JsonNode files = bundle.get("files");
        assertThat(files).hasSize(2);

        Set<String> nonces = new HashSet<>();
        files.forEach(f -> nonces.add(f.get("nonce").asText()));
        assertThat(nonces).hasSize(2);
    }

    @Test
    void zipDownload_containsEncryptedFiles() throws Exception {
        byte[] file1Data = new byte[]{0x0A, 0x0B};
        byte[] file2Data = new byte[]{0x0C, 0x0D, 0x0E};
        CreateEncryptedPasteRequest req = createLinkRequest(List.of(
                createDummyFile("file1.bin", file1Data),
                createDummyFile("file2.bin", file2Data)
        ), false);

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        MvcResult zipResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download-zip"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/zip"))
                .andReturn();

        byte[] zipBytes = zipResult.getResponse().getContentAsByteArray();
        assertThat(zipBytes).isNotEmpty();

        int entryCount = 0;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = zis.read(buf)) > 0) baos.write(buf, 0, n);
                byte[] content = baos.toByteArray();

                if ("manifest.json".equals(entry.getName())) {
                    JsonNode manifest = objectMapper.readTree(content);
                    assertThat(manifest.get("format").asText()).isEqualTo("extra:enc-zip:v1");
                    assertThat(manifest.get("pasteId").asText()).isEqualTo(pasteId);
                    assertThat(manifest.get("files")).hasSize(2);
                } else if ("file1.bin.enc".equals(entry.getName())) {
                    // Entry format: nonce (12B) || ciphertext (NB) || authTag (16B)
                    assertThat(content.length).isEqualTo(12 + file1Data.length + 16);
                    byte[] ct = Arrays.copyOfRange(content, 12, content.length - 16);
                    assertThat(ct).isEqualTo(file1Data);
                } else if ("file2.bin.enc".equals(entry.getName())) {
                    assertThat(content.length).isEqualTo(12 + file2Data.length + 16);
                    byte[] ct = Arrays.copyOfRange(content, 12, content.length - 16);
                    assertThat(ct).isEqualTo(file2Data);
                }
            }
        }
        assertThat(entryCount).isEqualTo(3);
    }

    @Test
    void zipDownload_filesHaveDistinctNonces() throws Exception {
        byte[] nonce1 = new byte[]{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
        byte[] nonce2 = new byte[]{2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2};
        CreateEncryptedPasteRequest req = createLinkRequest(List.of(
                createDummyFileWithNonce("f1.bin", new byte[]{1}, nonce1),
                createDummyFileWithNonce("f2.bin", new byte[]{2}, nonce2)
        ), false);

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        MvcResult zipResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download-zip"))
                .andExpect(status().isOk())
                .andReturn();

        Set<String> nonces = new HashSet<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipResult.getResponse().getContentAsByteArray()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = zis.read(buf)) > 0) baos.write(buf, 0, n);
                byte[] content = baos.toByteArray();

                if ("manifest.json".equals(entry.getName())) {
                    JsonNode manifest = objectMapper.readTree(content);
                    manifest.get("files").forEach(f -> nonces.add(f.get("nonce").asText()));
                }
            }
        }
        assertThat(nonces).hasSize(2);
    }

    @Test
    void burnAfterRead_atomicPurgeOnFirstRead_andUniform404() throws Exception {
        CreateEncryptedPasteRequest req = createLinkRequest(List.of(createDummyFile("burn.txt", new byte[]{9, 8, 7})), true);
        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.burnAfterReading").value(true))
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // 1st Read: Succeeds
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.encryptionMode").value("LINK"));

        // 2nd Read: Consumed burn-after-read paste returns 404
        MvcResult consumedResult = mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound())
                .andReturn();

        // Non-existent paste also returns 404
        MvcResult nonexistentResult = mockMvc.perform(get("/api/v1/pastes/non-existent-paste-id-999"))
                .andExpect(status().isNotFound())
                .andReturn();

        // Deep structural and value equality check: exact match of JSON payload (indistinguishability property)
        JsonNode consumedNode = objectMapper.readTree(consumedResult.getResponse().getContentAsString());
        JsonNode nonexistentNode = objectMapper.readTree(nonexistentResult.getResponse().getContentAsString());

        // Dynamic per-request fields (instance URI and timestamp) naturally differ; remove them before equality check
        if (consumedNode instanceof com.fasterxml.jackson.databind.node.ObjectNode obj) {
            obj.remove("instance");
            obj.remove("timestamp");
        }
        if (nonexistentNode instanceof com.fasterxml.jackson.databind.node.ObjectNode obj) {
            obj.remove("instance");
            obj.remove("timestamp");
        }

        assertThat(consumedNode).isEqualTo(nonexistentNode);
    }

    @Test
    void decryptFailed_isRateLimitedPerIp() throws Exception {
        // Rate limit is keyed on ClientIpResolver's resolved IP; in MockMvc that
        // is the synthetic remote address (127.0.0.1). Header spoofing is
        // exercised separately by ClientIpResolverTest.
        // Send 10 requests -> all 204
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post("/api/v1/pastes/any-paste-id/decrypt-failed")
                            .with(csrf()))
                    .andExpect(status().isNoContent());
        }

        // 11th request -> 429 Too Many Requests
        mockMvc.perform(post("/api/v1/pastes/any-paste-id/decrypt-failed")
                        .with(csrf()))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void decryptFailed_doesNotLeakPasteExistence() throws Exception {
        mockMvc.perform(post("/api/v1/pastes/completely-nonexistent-paste-id/decrypt-failed")
                        .with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void unknownJsonField_returns400BadRequest() throws Exception {
        String jsonWithUnknown = """
                {
                    "files": [
                        {
                            "filenameHint": "test.txt",
                            "nonce": "AQIDBAUGBwgJCgsM",
                            "ciphertext": "AQIDBA==",
                            "authTag": "AQIDBAUGBwgJCgsMDQ4PEA=="
                        }
                    ],
                    "encryptionMode": "LINK",
                    "kdfSalt": "AQIDBAUGBwgJCgsMDQ4PEA==",
                    "kdfIterations": 600000,
                    "wrappedKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    "unexpectedInjectedProperty": "malicious"
                }
                """;

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonWithUnknown))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void passwordAndEncryption_mutuallyExclusive_rejected() throws Exception {
        // Submitting an encrypted request with an attempted password field must be rejected
        String jsonWithBoth = """
                {
                    "files": [
                        {
                            "filenameHint": "test.txt",
                            "nonce": "AQIDBAUGBwgJCgsM",
                            "ciphertext": "AQIDBA==",
                            "authTag": "AQIDBAUGBwgJCgsMDQ4PEA=="
                        }
                    ],
                    "encryptionMode": "LINK",
                    "kdfSalt": "AQIDBAUGBwgJCgsMDQ4PEA==",
                    "kdfIterations": 600000,
                    "wrappedKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    "password": "myPlaintextPassword"
                }
                """;

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonWithBoth))
                .andExpect(status().isBadRequest());
    }

    @Test
    void plaintextPasswordPaste_stillWorksAfterMigration() throws Exception {
        // Regression test: plaintext paste with password still functions correctly after V11 migration
        CreatePasteRequest createRequest = new CreatePasteRequest(
                "Plaintext Password Paste",
                "Secret plaintext content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                "Password123!"
        );

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passwordProtected").value(true))
                .andReturn();

        String pasteId = objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // 1. Without password -> content is masked, passwordRequired is true
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(true))
                .andExpect(jsonPath("$.content").value(""));

        // 2. With correct password header -> content is revealed
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "Password123!"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(false))
                .andExpect(jsonPath("$.content").value("Secret plaintext content"));
    }

    @Test
    void omittedBurnAfterReading_defaultsToFalse() throws Exception {
        byte[] validWrappedKey = new byte[60];
        validWrappedKey[0] = 1;
        validWrappedKey[50] = 1;
        String validWrappedKeyB64 = Base64.getEncoder().encodeToString(validWrappedKey);

        // Omitted burnAfterReading property in JSON
        String jsonWithoutBurn = """
                {
                    "files": [
                        {
                            "filenameHint": "test.txt",
                            "nonce": "AQIDBAUGBwgJCgsM",
                            "ciphertext": "AQIDBA==",
                            "authTag": "AQIDBAUGBwgJCgsMDQ4PEA=="
                        }
                    ],
                    "encryptionMode": "LINK",
                    "kdfSalt": "AQIDBAUGBwgJCgsMDQ4PEA==",
                    "kdfIterations": 600000,
                    "wrappedKey": "%s"
                }
                """.formatted(validWrappedKeyB64);

        mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonWithoutBurn))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.burnAfterReading").value(false));
    }
}
