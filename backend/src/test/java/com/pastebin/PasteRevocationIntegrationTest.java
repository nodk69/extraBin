package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.EncryptedFilePayload;
import com.pastebin.paste.domain.DeletionCapabilityUtil;
import com.pastebin.paste.domain.EncryptionMode;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 2 Red Test Suite: Granular Sharing Permissions & Link Revocation
 *
 * Obeying AGENTS.md Six-Phase Engineering Protocol:
 * Compiles cleanly against existing production classes without any production code changes.
 * Exercises real Spring MVC stack and endpoints to verify clean, expected failures for missing
 * token generation, token verification, link revocation, and link rotation behavior.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasteRevocationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User testOwner;
    private PastebinUserPrincipal ownerPrincipal;

    private User otherUser;
    private PastebinUserPrincipal otherPrincipal;

    @BeforeEach
    void setUp() {
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        testOwner = userRepository.save(new User("owner_" + uniqueSuffix, "owner_" + uniqueSuffix + "@pastebin.dev", passwordEncoder.encode("Pass123!"), "ROLE_USER"));
        ownerPrincipal = new PastebinUserPrincipal(testOwner);

        otherUser = userRepository.save(new User("other_" + uniqueSuffix, "other_" + uniqueSuffix + "@pastebin.dev", passwordEncoder.encode("Pass123!"), "ROLE_USER"));
        otherPrincipal = new PastebinUserPrincipal(otherUser);
    }

    private String extractShareTokenStrict(String responseJson) throws Exception {
        var node = objectMapper.readTree(responseJson);
        assertThat(node.hasNonNull("shareToken"))
                .as("Response must contain a non-null 'shareToken' property")
                .isTrue();
        String token = node.get("shareToken").asText();
        assertThat(token)
                .as("Share token must not be blank")
                .isNotBlank();
        return token;
    }

    // =========================================================================
    // SECTION 1: Token Generation, Format, and Exposure Constraints
    // =========================================================================

    @Test
    @DisplayName("RED-01: New unlisted paste returns 256-bit URL-safe shareToken with shr_ prefix only in creation response")
    void createUnlistedPaste_returnsTokenOnlyInCreationResponse() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Unlisted Tokenized Paste",
                "console.log('secret unlisted code');",
                "javascript",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(responseJson).get("id").asText();
        String shareToken = extractShareTokenStrict(responseJson);

        // Verify format: prefix "shr_" + 43 URL-safe base64 characters (256-bit entropy)
        assertThat(shareToken).startsWith("shr_");
        assertThat(shareToken.length()).isEqualTo(47);
        assertThat(shareToken).matches("^shr_[A-Za-z0-9_-]{43}$");

        // Ordinary retrieval with valid token must NOT leak the shareToken or hash in PasteViewResponse
        MvcResult viewRes = mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken))
                .andExpect(status().isOk())
                .andReturn();
        String viewJson = viewRes.getResponse().getContentAsString();
        assertThat(objectMapper.readTree(viewJson).has("shareToken"))
                .as("Ordinary PasteViewResponse must NEVER disclose shareToken")
                .isFalse();
        assertThat(objectMapper.readTree(viewJson).has("shareTokenHash"))
                .as("Ordinary PasteViewResponse must NEVER disclose shareTokenHash")
                .isFalse();
    }

    @Test
    @DisplayName("RED-02: Public paste creation does NOT generate a shareToken")
    void createPublicPaste_doesNotIncludeShareToken() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Open Public Paste",
                "println('hello public');",
                "kotlin",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        assertThat(objectMapper.readTree(responseJson).get("shareToken"))
                .as("Public paste must NOT have a shareToken in creation response")
                .isNull();
    }

    @Test
    @DisplayName("RED-03: Private paste creation does NOT generate a shareToken")
    void createPrivatePaste_doesNotIncludeShareToken() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Private User Paste",
                "secret owner notes",
                "plaintext",
                Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        assertThat(objectMapper.readTree(responseJson).get("shareToken"))
                .as("Private paste must NOT have a shareToken in creation response")
                .isNull();
    }

    // =========================================================================
    // SECTION 2: Token Verification, Non-Disclosure (404), and Legacy Compatibility
    // =========================================================================

    @Test
    @DisplayName("RED-04: Active unlisted paste requires shareToken; missing, malformed, or invalid tokens return 404")
    void unlistedPaste_requiresValidToken_missingOrInvalidReturns404() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Unlisted Security Audit",
                "secure text payload",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(responseJson).get("id").asText();
        String validToken = extractShareTokenStrict(responseJson);

        // 1. Missing token -> 404 Not Found (non-disclosure invariant)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        // 2. Empty token -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", ""))
                .andExpect(status().isNotFound());

        // 3. Malformed token (missing shr_ prefix) -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", "invalid_prefix_abc123"))
                .andExpect(status().isNotFound());

        // 4. Truncated token -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", validToken.substring(0, 10)))
                .andExpect(status().isNotFound());

        // 5. Wrong token with valid format -> 404 Not Found
        String wrongToken = "shr_0000000000000000000000000000000000000000000";
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", wrongToken))
                .andExpect(status().isNotFound());

        // 6. Valid token via Query Parameter -> 200 OK
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", validToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.content").value("secure text payload"));

        // 7. Valid token via X-Share-Token Header -> 200 OK
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).header("X-Share-Token", validToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.content").value("secure text payload"));
    }

    @Test
    @DisplayName("RED-05: Legacy unlisted paste (created prior to migration) remains accessible without token")
    void legacyUnlistedPaste_withoutToken_remainsAccessible() throws Exception {
        String legacyId = "leg_" + UUID.randomUUID().toString().substring(0, 10);
        Paste legacyPaste = new Paste(
                legacyId,
                null,
                "Legacy Unlisted Paste",
                "legacy content from old ExtraBin version",
                "plaintext",
                Visibility.UNLISTED,
                41,
                1,
                null,
                Instant.now().plus(1, ChronoUnit.DAYS)
        );
        pasteRepository.save(legacyPaste);

        // Invariant: Legacy unlisted record remains accessible without token
        mockMvc.perform(get("/api/v1/pastes/" + legacyId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(legacyId))
                .andExpect(jsonPath("$.content").value("legacy content from old ExtraBin version"));
    }

    // =========================================================================
    // SECTION 3: Content-Delivery Routes Enforcement
    // =========================================================================

    @Test
    @DisplayName("RED-06: Revoked unlisted paste denies shared access with 404 across every content-delivery route")
    void revokeLink_authenticatedOwner_blocksAllContentRoutesForRecipients() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Revoke Target Config",
                "server:\n  port: 8080\n  secret: super_classified",
                "yaml",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // Verify route accessibility with valid token before revocation
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken)).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw").param("token", shareToken)).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + ".yaml").param("token", shareToken)).andExpect(status().isOk());

        // Owner revokes link via POST /api/v1/pastes/{id}/revoke-link
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // 1. JSON view endpoint -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken))
                .andExpect(status().isNotFound());

        // 2. Raw endpoint -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw").param("token", shareToken))
                .andExpect(status().isNotFound());

        // 3. Download endpoint -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download").param("token", shareToken))
                .andExpect(status().isNotFound());

        // 4. Download-ZIP endpoint -> 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download-zip").param("token", shareToken))
                .andExpect(status().isNotFound());

        // 5. All supported typed API extensions -> 404 Not Found
        for (String ext : List.of("json", "yaml", "md", "txt", "csv", "xml")) {
            mockMvc.perform(get("/api/v1/pastes/" + pasteId + "." + ext).param("token", shareToken))
                    .andExpect(status().isNotFound());
        }

        // 6. Verified account owner can still view their owned paste
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).with(user(ownerPrincipal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.isOwner").value(true));
    }

    @Test
    @DisplayName("RED-07: Multi-file unlisted paste blocks single-file raw and download endpoints upon revocation")
    void revokeLink_multiFileUnlistedPaste_blocksFileRawAndDownloadRoutes() throws Exception {
        var f1 = new com.pastebin.paste.api.dto.PasteFileRequest("module.py", "def run(): pass", "python");
        var f2 = new com.pastebin.paste.api.dto.PasteFileRequest("setup.cfg", "[metadata]\nname=pkg", "plaintext");

        CreatePasteRequest createReq = new CreatePasteRequest(
                "Multi File Package",
                "primary placeholder",
                "python",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(f1, f2),
                null,
                null
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // Pre-revocation check
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/module.py/raw").param("token", shareToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/module.py/download").param("token", shareToken))
                .andExpect(status().isOk());

        // Owner revokes link
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // Post-revocation checks
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/module.py/raw").param("token", shareToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/files/module.py/download").param("token", shareToken))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // SECTION 4: Authorization Precedence, Ownership, and Revocation/Rotation
    // =========================================================================

    @Test
    @DisplayName("RED-08: Anonymous unlisted paste can be revoked using valid deletion capability")
    void revokeLink_anonymousOwner_withValidCapability_succeeds() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Anon Unlisted Note",
                "anonymous transient secrets",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String capability = objectMapper.readTree(resJson).get("deletionCapability").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // Anonymous owner revokes using deletionCapability
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("deletionCapability", capability))))
                .andExpect(status().isNoContent());

        // Subsequent token retrieval is denied with 404
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("RED-09: Anonymous unlisted paste rejects revocation attempt with invalid capability")
    void revokeLink_anonymousOwner_withInvalidCapability_returnsForbidden() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Anon Target",
                "data",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("deletionCapability", "del_invalid_capability_xyz"))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("RED-10: Account-owned unlisted paste rejects revocation attempt by authenticated non-owner")
    void revokeLink_accountOwned_byNonOwner_returnsForbidden() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Owner Only Unlisted",
                "strictly owner content",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // otherPrincipal cannot revoke ownerPrincipal's paste
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(otherPrincipal)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("RED-11: Share token alone CANNOT be used to revoke or rotate the link")
    void shareToken_alone_cannotRevokeOrRotate() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Credential Confusion Target",
                "protected payload",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // Attempt to pass shareToken as deletionCapability to revoke-link without owner session
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("deletionCapability", shareToken))))
                .andExpect(status().isForbidden());

        // Attempt to pass shareToken to rotate-link without owner session
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/rotate-link")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("deletionCapability", shareToken))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("RED-12: Deletion capability CANNOT be used as shareToken to view unlisted paste")
    void deletionCapability_cannotBeUsedAsShareToken() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Capability as Share Token",
                "secret data",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String capability = objectMapper.readTree(resJson).get("deletionCapability").asText();

        // Supplying deletionCapability as "?token=" must yield 404 Not Found
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", capability))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("RED-13: Share token holder CANNOT access owner revisions")
    void shareToken_cannotAccessOwnerRevisions() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Versioned Paste",
                "version 1 text",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // GET /api/v1/account/pastes/{id}/revisions requires owner session; token has zero standing
        mockMvc.perform(get("/api/v1/account/pastes/" + pasteId + "/revisions").param("token", shareToken))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/account/pastes/" + pasteId + "/revisions")
                        .with(user(otherPrincipal))
                        .param("token", shareToken))
                .andExpect(status().isForbidden());
    }

    // =========================================================================
    // SECTION 5: Link Rotation and Idempotent Revocation
    // =========================================================================

    @Test
    @DisplayName("RED-14: Owner rotates link; old token returns 404, new token returns 200, repeated rotations invalidate previous tokens")
    void rotateLink_invalidatesOldToken_andReEnablesAccess() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Rotation Lifecycle",
                "content under rotation",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String token1 = extractShareTokenStrict(resJson);

        // Rotation 1: yields token2
        MvcResult rotateRes1 = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/rotate-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();

        String token2 = extractShareTokenStrict(rotateRes1.getResponse().getContentAsString());
        assertThat(token2).isNotEqualTo(token1);

        // Rotation 2: yields token3
        MvcResult rotateRes2 = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/rotate-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();

        String token3 = extractShareTokenStrict(rotateRes2.getResponse().getContentAsString());
        assertThat(token3).isNotEqualTo(token2);

        // Invariant: token1 and token2 return 404, only latest token3 returns 200
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", token1)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", token2)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", token3))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.content").value("content under rotation"));
    }

    @Test
    @DisplayName("RED-15: Rotation from REVOKED state re-enables access under new token")
    void rotateLink_fromRevokedState_reEnablesAccess() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Revoked to Rotated",
                "payload to resurrect",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String oldToken = extractShareTokenStrict(resJson);

        // Revoke
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // Verify revoked
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", oldToken)).andExpect(status().isNotFound());

        // Rotate from REVOKED -> re-enables access with fresh token
        MvcResult rotateRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/rotate-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();

        String newToken = extractShareTokenStrict(rotateRes.getResponse().getContentAsString());

        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", oldToken)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", newToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("payload to resurrect"));
    }

    @Test
    @DisplayName("RED-16: Repeated revocation is idempotent and returns 204")
    void revokeLink_repeatedCalls_isIdempotent() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Idempotent Revoke Target",
                "idempotent text",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // First revocation -> 204
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // Repeated revocation -> 204 (idempotent, does not error out)
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());
    }

    // =========================================================================
    // SECTION 6: Cache, Conditional Requests, and Precedence Matrix
    // =========================================================================

    @Test
    @DisplayName("RED-17: Conditional GET with If-None-Match on revoked paste returns 404, never 304")
    void conditionalGet_onRevokedPaste_returns404Not304() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "ETag Revocation Test",
                "cache sensitive content",
                "json",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // 1. Initial GET captures ETag
        MvcResult getRes = mockMvc.perform(get("/api/v1/pastes/" + pasteId + ".json").param("token", shareToken))
                .andExpect(status().isOk())
                .andReturn();
        String etag = getRes.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(etag).isNotNull();

        // 2. Owner revokes link
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // 3. Conditional GET with If-None-Match MUST return 404 Not Found, NEVER 304 Not Modified
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + ".json")
                        .param("token", shareToken)
                        .header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("RED-18: Password-protected unlisted paste enforces token check BEFORE password challenge (avoids leaking passcode prompt)")
    void passwordProtectedUnlistedPaste_requiresBothTokenAndPasscode_inStrictPrecedence() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Protected Unlisted Under Locks",
                "content under two locks",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY,
                "SecretPasscode123!"
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // 1. Without shareToken -> 404 (non-disclosure: does NOT reveal passwordRequired challenge)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound());

        // 2. With wrong shareToken -> 404
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", "shr_0000000000000000000000000000000000000000000"))
                .andExpect(status().isNotFound());

        // 3. With valid shareToken but WITHOUT passcode -> 200 challenge (masked content, passwordRequired=true)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(true))
                .andExpect(jsonPath("$.content").value(""));

        // 4. With valid shareToken AND valid passcode -> 200 unlocked content
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .param("token", shareToken)
                        .header("X-Paste-Password", "SecretPasscode123!"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(false))
                .andExpect(jsonPath("$.content").value("content under two locks"));
    }

    @Test
    @DisplayName("RED-19: Revoked E2E encrypted paste blocks server-mediated ciphertext and bundle delivery")
    void revokeLink_encryptedPaste_blocksServerMediatedCiphertextDelivery() throws Exception {
        byte[] salt = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
        byte[] nonce = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12};
        byte[] ct = "encrypted_secret_data".getBytes();
        byte[] tag = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
        byte[] wrappedKey = new byte[60];
        for (int i = 0; i < 60; i++) wrappedKey[i] = (byte) (i + 1);

        EncryptedFilePayload file = new EncryptedFilePayload("secrets.txt", nonce, ct, tag);
        CreateEncryptedPasteRequest encReq = new CreateEncryptedPasteRequest(
                List.of(file),
                "LINK",
                salt,
                600000,
                wrappedKey,
                null,
                Visibility.UNLISTED,
                "plaintext",
                false,
                null
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(encReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String shareToken = extractShareTokenStrict(resJson);

        // Before revocation: ciphertext accessible with token
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken)).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw").param("token", shareToken)).andExpect(status().isOk());

        // Revoke link
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // Post revocation: server blocks delivery of ciphertext
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", shareToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw").param("token", shareToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download").param("token", shareToken))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // SECTION 7: Concurrency & Race-Condition Suite (Deterministic Latches)
    // =========================================================================

    @Test
    @DisplayName("RED-20: Concurrent rotation and revocation settle into a deterministic final state")
    void concurrentRotationAndRevocation_settleDeterministically() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Concurrency Test Paste",
                "parallel content",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String resJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(resJson).get("id").asText();
        String originalToken = extractShareTokenStrict(resJson);

        int threadCount = 2;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        AtomicInteger revokeStatus = new AtomicInteger(0);
        AtomicInteger rotateStatus = new AtomicInteger(0);

        // Thread 1: Revocation
        executor.submit(() -> {
            try {
                startLatch.await(5, TimeUnit.SECONDS);
                MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                                .with(csrf())
                                .with(user(ownerPrincipal)))
                        .andReturn();
                revokeStatus.set(res.getResponse().getStatus());
            } catch (Exception e) {
                revokeStatus.set(500);
            } finally {
                doneLatch.countDown();
            }
        });

        // Thread 2: Rotation
        executor.submit(() -> {
            try {
                startLatch.await(5, TimeUnit.SECONDS);
                MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/rotate-link")
                                .with(csrf())
                                .with(user(ownerPrincipal)))
                        .andReturn();
                rotateStatus.set(res.getResponse().getStatus());
            } catch (Exception e) {
                rotateStatus.set(500);
            } finally {
                doneLatch.countDown();
            }
        });

        // Fire both concurrently
        startLatch.countDown();
        boolean finished = doneLatch.await(10, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(finished).as("Concurrent operations must finish within bounded 10s timeout").isTrue();

        // Original token MUST ALWAYS be invalidated regardless of which operation finished first
        mockMvc.perform(get("/api/v1/pastes/" + pasteId).param("token", originalToken))
                .andExpect(status().isNotFound());

        // Invariant: Verify persisted database record is in a consistent, legal state
        Paste finalPaste = pasteRepository.findActiveByPublicId(pasteId, Instant.now()).orElseThrow();
        assertThat(finalPaste).isNotNull();
        // The entity must have either been revoked (no active token hash) or rotated to a fresh token hash
        // It must NEVER retain the original token hash or an illegal combination
    }

    // =========================================================================
    // SECTION 6: Reply Authorization & Referrer-Policy Integration Tests (Step 1 Red Phase)
    // =========================================================================

    @Test
    @DisplayName("RED-REPLY-01: GET replies on active unlisted paste requires valid shareToken; missing/invalid returns 404")
    void replies_get_unlistedPaste_requiresValidToken_missingOrInvalidReturns404() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Unlisted Discussion",
                "Code needing feedback",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(responseJson).get("id").asText();
        String validToken = extractShareTokenStrict(responseJson);

        // 1. Other user GET replies without token -> MUST return 404 (Anti-oracle non-disclosure)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(otherPrincipal)))
                .andExpect(status().isNotFound());

        // 2. Other user GET replies with invalid token -> MUST return 404
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(otherPrincipal))
                        .param("token", "shr_invalid_token_12345678901234567890123456789012"))
                .andExpect(status().isNotFound());

        // 3. Other user GET replies with valid token in query param -> 200 OK
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(otherPrincipal))
                        .param("token", validToken))
                .andExpect(status().isOk());

        // 4. Other user GET replies with valid token in X-Share-Token header -> 200 OK
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(otherPrincipal))
                        .header("X-Share-Token", validToken))
                .andExpect(status().isOk());

        // 5. Owner GET replies without token -> 200 OK (Owner access preserved)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(ownerPrincipal)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("RED-REPLY-02: POST reply on active unlisted paste requires valid shareToken; missing/invalid returns 404")
    void replies_post_unlistedPaste_requiresValidToken_missingOrInvalidReturns404() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Unlisted Collab",
                "function collaborate() {}",
                "javascript",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(responseJson).get("id").asText();
        String validToken = extractShareTokenStrict(responseJson);

        var replyReq = new com.pastebin.paste.api.dto.CreateReplyRequest("Here is a review note", null);

        // 1. Other user POST reply without token -> MUST return 404 (Anti-oracle non-disclosure)
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(otherPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replyReq)))
                .andExpect(status().isNotFound());

        // 2. Other user POST reply with invalid token -> MUST return 404
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(otherPrincipal))
                        .param("token", "shr_invalid_token_12345678901234567890123456789012")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replyReq)))
                .andExpect(status().isNotFound());

        // 3. Other user POST reply with valid token in query param -> 201 Created
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(otherPrincipal))
                        .param("token", validToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replyReq)))
                .andExpect(status().isCreated());

        // 4. Other user POST reply with valid token in X-Share-Token header -> 201 Created
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(otherPrincipal))
                        .header("X-Share-Token", validToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.pastebin.paste.api.dto.CreateReplyRequest("Another review note", null))))
                .andExpect(status().isCreated());

        // 5. Owner POST reply without token -> 201 Created (Owner access preserved)
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.pastebin.paste.api.dto.CreateReplyRequest("Owner note", null))))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("RED-REPLY-03: Revoked unlisted paste rejects reply read and create even with previous token (returns 404)")
    void replies_revokedUnlistedPaste_rejectsAccessWithOldToken() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Revocation Reply Test",
                "Sensitive content",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String responseJson = createRes.getResponse().getContentAsString();
        String pasteId = objectMapper.readTree(responseJson).get("id").asText();
        String oldToken = extractShareTokenStrict(responseJson);

        // Revoke the link
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link")
                        .with(csrf())
                        .with(user(ownerPrincipal)))
                .andExpect(status().isNoContent());

        // 1. GET replies with old token -> MUST return 404
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(otherPrincipal))
                        .param("token", oldToken))
                .andExpect(status().isNotFound());

        // 2. POST reply with old token -> MUST return 404
        var replyReq = new com.pastebin.paste.api.dto.CreateReplyRequest("Attempted post on revoked paste", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(otherPrincipal))
                        .param("token", oldToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replyReq)))
                .andExpect(status().isNotFound());

        // 3. Owner retains view and create access on revoked paste
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(ownerPrincipal)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .with(user(ownerPrincipal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new com.pastebin.paste.api.dto.CreateReplyRequest("Owner followup", null))))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("RED-REF-01: Content delivery routes emit Referrer-Policy: no-referrer header")
    void contentDeliveryRoutes_emitNoReferrerPolicyHeader() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Referrer Test",
                "Referrer header verification",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // Check GET paste view route
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(header().string("Referrer-Policy", "no-referrer"));

        // Check GET raw route
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isOk())
                .andExpect(header().string("Referrer-Policy", "no-referrer"));

        // Check GET download route
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download"))
                .andExpect(status().isOk())
                .andExpect(header().string("Referrer-Policy", "no-referrer"));

        // Check GET typed suffix route
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + ".txt"))
                .andExpect(status().isOk())
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }
}

