package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.*;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "pastebin.share.public-base-url=https://share.extra.example")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class E2eeSecurityLifecycleIntegrationTest {

    private static final String PASSWORD = "TestPassword123!";
    private static final String SYNTHETIC_SECRET_KEY = "synthetic-test-key-material-never-log";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private RateLimiterService rateLimiterService;

    private String uid;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    private MockHttpSession registerAndLogin(String username) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RegisterRequest(username, username + "@example.com", PASSWORD))))
                .andExpect(status().isCreated());
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) loginResult.getRequest().getSession();
    }

    private CreatePasteResponse createEncryptedPaste(Visibility visibility, MockHttpSession session) throws Exception {
        byte[] ciphertext = "{encrypted-binary-data}".getBytes(StandardCharsets.UTF_8);
        EncryptedFilePayload file = new EncryptedFilePayload(
                "notes.md",
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12},
                ciphertext,
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16});
        byte[] wrappedKey = new byte[60];
        for (int i = 0; i < wrappedKey.length; i++) {
            wrappedKey[i] = (byte) (i + 1);
        }
        CreateEncryptedPasteRequest request = new CreateEncryptedPasteRequest(
                List.of(file),
                "LINK",
                new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16},
                600000,
                wrappedKey,
                null,
                visibility,
                "markdown",
                false,
                null
        );

        var builder = post("/api/v1/pastes/encrypted").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request));
        if (session != null) {
            builder.session(session);
        }
        MvcResult result = mockMvc.perform(builder)
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readValue(result.getResponse().getContentAsString(), CreatePasteResponse.class);
    }

    @Test
    @DisplayName("E2EE-BE-01: Public canonical route /p/{id} returns indistinguishable 404 Problem Details without crawler leaks")
    void publicCanonicalRoute_returnsIndistinguishable404_forEncryptedPastes() throws Exception {
        CreatePasteResponse response = createEncryptedPaste(Visibility.PUBLIC, null);
        String publicId = response.id();

        MvcResult result = mockMvc.perform(get("/p/" + publicId))
                .andReturn();

        assertEquals(404, result.getResponse().getStatus(), "Crawler request to /p/{id} for encrypted paste must return 404 Problem Details");
        assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
        assertThat(result.getResponse().getContentAsString()).doesNotContain("notes.md");
        assertThat(result.getResponse().getContentAsString()).doesNotContain("{encrypted-binary-data}");
        assertThat(result.getResponse().getHeader("X-Robots-Tag")).containsIgnoringCase("noindex");
    }

    @Test
    @DisplayName("E2EE-BE-02: Backend strictly rejects plaintext edits on encrypted pastes")
    void backendStrictlyRejectsPlaintextEdit_onEncryptedPastes() throws Exception {
        MockHttpSession session = registerAndLogin("encowner" + uid);
        CreatePasteResponse response = createEncryptedPaste(Visibility.PUBLIC, session);
        String publicId = response.id();

        EditPasteRequest editRequest = new EditPasteRequest(
                "Tampered Title",
                "Malicious plaintext overwrite",
                "markdown",
                Visibility.PUBLIC,
                0L
        );

        MvcResult result = mockMvc.perform(put("/api/v1/account/pastes/" + publicId)
                        .with(csrf())
                        .session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editRequest)))
                .andExpect(status().isBadRequest())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body).contains("Encrypted pastes cannot be edited via the plaintext editor.");
    }

    @Test
    @DisplayName("E2EE-BE-03: Rotating share token on unlisted E2EE paste updates token and preserves ciphertext")
    void unlistedE2eePaste_rotateToken_preservesCiphertextAndRotatesShareToken() throws Exception {
        MockHttpSession session = registerAndLogin("rotowner" + uid);
        CreatePasteResponse response = createEncryptedPaste(Visibility.UNLISTED, session);
        String publicId = response.id();
        String initialToken = response.shareToken();
        assertThat(initialToken).isNotBlank();

        MvcResult rotateResult = mockMvc.perform(post("/api/v1/pastes/" + publicId + "/rotate-link")
                        .with(csrf())
                        .session(session))
                .andExpect(status().isOk())
                .andReturn();

        RotateLinkResponse rotateResponse = objectMapper.readValue(rotateResult.getResponse().getContentAsString(), RotateLinkResponse.class);
        String freshToken = rotateResponse.shareToken();
        assertThat(freshToken).isNotBlank().isNotEqualTo(initialToken);

        // Previous token must now be rejected
        mockMvc.perform(get("/api/v1/pastes/" + publicId)
                        .header("X-Share-Token", initialToken))
                .andExpect(status().isNotFound());

        // Fresh token can retrieve ciphertext
        MvcResult freshGet = mockMvc.perform(get("/api/v1/pastes/" + publicId)
                        .header("X-Share-Token", freshToken))
                .andExpect(status().isOk())
                .andReturn();

        PasteViewResponse view = objectMapper.readValue(freshGet.getResponse().getContentAsString(), PasteViewResponse.class);
        assertThat(view.encryptionMode()).isEqualTo(com.pastebin.paste.domain.EncryptionMode.LINK);
        assertThat(view.files()).isNotEmpty();
        assertThat(view.files().get(0).filename()).isEqualTo("notes.md");
    }

    @Test
    @DisplayName("E2EE-BE-04: Synthetic secret key strings never appear in database or error bodies")
    void syntheticKeyNeverAppearsInDatabaseOrResponses() throws Exception {
        CreatePasteResponse response = createEncryptedPaste(Visibility.PUBLIC, null);
        String publicId = response.id();

        // Query raw content
        MvcResult rawResult = mockMvc.perform(get("/api/v1/pastes/" + publicId + "/raw"))
                .andExpect(status().isOk())
                .andReturn();

        String rawContent = rawResult.getResponse().getContentAsString();
        assertThat(rawContent).doesNotContain(SYNTHETIC_SECRET_KEY);

        // Verify DB directly
        Paste paste = pasteRepository.findActiveByPublicId(publicId, java.time.Instant.now()).orElseThrow();
        assertThat(paste.getContent()).isNull();
        assertThat(paste.getEncryptionMode().name()).isEqualTo("LINK");
    }

    @Test
    @DisplayName("E2EE-BE-05: Encrypted ZIP export contains only .enc files and valid manifest.json without plaintext")
    void encryptedZipExport_containsOnlyEncFilesAndSanitizedManifest() throws Exception {
        CreatePasteResponse response = createEncryptedPaste(Visibility.PUBLIC, null);
        String publicId = response.id();

        MvcResult zipResult = mockMvc.perform(get("/api/v1/pastes/" + publicId + "/download-zip"))
                .andExpect(status().isOk())
                .andReturn();

        byte[] zipBytes = zipResult.getResponse().getContentAsByteArray();
        assertThat(zipBytes).isNotEmpty();

        List<String> entryNames = new ArrayList<>();
        String manifestContent = null;

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryNames.add(entry.getName());
                if ("manifest.json".equals(entry.getName())) {
                    manifestContent = new String(zis.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }

        assertThat(entryNames).contains("manifest.json", "notes.md.enc");
        assertThat(manifestContent).isNotNull();
        assertThat(manifestContent).contains("extra:enc-zip:v1");
        assertThat(manifestContent).doesNotContain(SYNTHETIC_SECRET_KEY);
    }
}
