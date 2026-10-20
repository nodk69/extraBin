package com.pastebin.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.domain.EncryptionMode;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.ModerationState;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteFile;
import com.pastebin.paste.domain.ShareAccessState;
import com.pastebin.paste.domain.ShareTokenUtil;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriUtils;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared fixtures for the sharing-experience red-phase suite.
 *
 * <p>The feature-configuration properties below are intentionally supplied even though the
 * production implementation does not bind them yet. Supplying them in the test environment
 * lets the red phase assert the agreed contract without touching production code.</p>
 */
@SpringBootTest(properties = {
        "pastebin.share.public-base-url=https://share.example.test",
        "pastebin.share.unlock-secret=phase2-test-unlock-secret-at-least-32-bytes",
        "pastebin.share.unlock-ttl-seconds=600",
        "pastebin.share.archive-max-entries=3",
        "pastebin.share.archive-max-bytes=4096",
        "pastebin.share.archive-max-output-bytes=2048"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class ShareTestSupport {

    protected static final MediaType APPLICATION_JSON = MediaType.APPLICATION_JSON;

    /**
     * Low-cost bcrypt encoder used only to create fixtures. Production verification reads the
     * cost from the stored hash, so this does not weaken the code under test.
     */
    private static final PasswordEncoder FIXTURE_ENCODER = new BCryptPasswordEncoder(4);

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected PasteRepository pasteRepository;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected RateLimiterService rateLimiterService;

    @BeforeEach
    void resetRateLimiter() {
        rateLimiterService.clear();
    }

    protected String unique(String prefix) {
        return prefix + "_" + Long.toUnsignedString(System.nanoTime());
    }

    protected String fastHash(String rawPassword) {
        return FIXTURE_ENCODER.encode(rawPassword);
    }

    protected MockHttpSession registerAndLogin() throws Exception {
        String username = "shareuser" + Long.toUnsignedString(System.nanoTime());
        RegisterRequest register = new RegisterRequest(username, username + "@example.test", "SecretPass123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(register)))
                .andExpect(status().isCreated());

        LoginRequest login = new LoginRequest(username, "SecretPass123!");
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(login)))
                .andExpect(status().isOk())
                .andReturn();

        return (MockHttpSession) result.getRequest().getSession();
    }

    protected String createPasteViaApi(String title,
                                       String content,
                                       Visibility visibility,
                                       ExpirationPolicy expiration,
                                       String password,
                                       MockHttpSession session) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(title, content, "plaintext", visibility, expiration, password);
        return performCreate(request, session);
    }

    protected String createMultiFilePasteViaApi(String title,
                                                List<String> filenames,
                                                List<String> contents,
                                                Visibility visibility,
                                                ExpirationPolicy expiration,
                                                String password,
                                                MockHttpSession session) throws Exception {
        List<PasteFileRequest> files = new ArrayList<>();
        for (int i = 0; i < filenames.size(); i++) {
            files.add(new PasteFileRequest(filenames.get(i), contents.get(i), "plaintext"));
        }
        CreatePasteRequest request = new CreatePasteRequest(title, null, null, visibility, expiration, password, files);
        return performCreate(request, session);
    }

    private String performCreate(CreatePasteRequest request, MockHttpSession session) throws Exception {
        var builder = post("/api/v1/pastes")
                .with(csrf())
                .contentType(APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request));
        if (session != null) {
            builder.session(session);
        }
        MvcResult result = mockMvc.perform(builder)
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    /**
     * Persists a deterministic fixture directly so that unsafe filenames, moderation states,
     * expiry boundaries, and non-API lifecycle states can be exercised.
     */
    protected String persistPaste(String prefix,
                                  String title,
                                  String content,
                                  Visibility visibility,
                                  String plainPassword,
                                  boolean burnAfterReading,
                                  ModerationState moderationState,
                                  Instant expiresAt,
                                  List<String> filenames,
                                  List<String> fileContents) {
        String publicId = unique(prefix);
        int size = content == null ? 0 : content.getBytes(StandardCharsets.UTF_8).length;
        int lines = (content == null || content.isEmpty()) ? 0 : content.split("\n", -1).length;
        Paste paste = new Paste(
                publicId,
                null,
                title,
                content,
                "plaintext",
                visibility,
                size,
                lines,
                null,
                expiresAt,
                burnAfterReading,
                plainPassword == null ? null : fastHash(plainPassword)
        );
        if (moderationState != null) {
            paste.setModerationState(moderationState);
        }
        if (filenames != null) {
            for (int i = 0; i < filenames.size(); i++) {
                paste.addFile(new PasteFile(paste, filenames.get(i), fileContents.get(i), "plaintext", i));
            }
        }
        pasteRepository.saveAndFlush(paste);
        return publicId;
    }

    protected String persistUnlisted(String prefix, String token, ShareAccessState state) {
        String publicId = unique(prefix);
        Paste paste = new Paste(
                publicId,
                null,
                "Unlisted share fixture",
                "unlisted secret content",
                "plaintext",
                Visibility.UNLISTED,
                23,
                1,
                null,
                null
        );
        paste.setShareAccessState(state);
        if (state == ShareAccessState.ACTIVE) {
            paste.setShareTokenHash(ShareTokenUtil.hashToken(token));
        }
        if (state == ShareAccessState.REVOKED) {
            paste.setLinkRevokedAt(Instant.now());
        }
        pasteRepository.saveAndFlush(paste);
        return publicId;
    }

    protected String persistEncrypted(String prefix) {
        String publicId = unique(prefix);
        Paste paste = new Paste(
                publicId,
                null,
                "Encrypted share fixture",
                "plaintext",
                Visibility.PUBLIC,
                10,
                1,
                null,
                null,
                false,
                EncryptionMode.LINK,
                new byte[16],
                100_000,
                new byte[32]
        );
        paste.addFile(new PasteFile(
                paste,
                "secret.txt",
                new byte[]{1, 2, 3, 4},
                new byte[12],
                new byte[16],
                new byte[32],
                "plaintext",
                0
        ));
        pasteRepository.saveAndFlush(paste);
        return publicId;
    }

    protected String contentDispositionFilename(MvcResult result) {
        String header = result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION);
        assertThat(header).as("Content-Disposition header").isNotNull();

        Matcher extended = Pattern.compile("filename\\*=UTF-8''([^;]+)", Pattern.CASE_INSENSITIVE).matcher(header);
        if (extended.find()) {
            return UriUtils.decode(extended.group(1), StandardCharsets.UTF_8);
        }
        Matcher quoted = Pattern.compile("filename=\"([^\"]*)\"").matcher(header);
        if (quoted.find()) {
            return quoted.group(1);
        }
        throw new AssertionError("No filename parameter in Content-Disposition: " + header);
    }

    protected List<String> zipEntryNames(byte[] zipBytes) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                names.add(entry.getName());
                zis.closeEntry();
            }
        }
        return names;
    }

    protected String lower(String value) {
        return value == null ? null : value.toLowerCase(Locale.ROOT);
    }
}
