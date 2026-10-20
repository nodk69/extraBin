package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreateEncryptedPasteRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.api.dto.EncryptedFilePayload;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class PasteApiTypedSuffixIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private RateLimiterService rateLimiterService;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
    }

    private MockHttpSession registerAndLogin(String usernamePrefix) throws Exception {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        String username = usernamePrefix + "_" + unique;
        String email = username + "@example.com";
        String password = "Password123!";

        RegisterRequest registerReq = new RegisterRequest(username, email, password);
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerReq)))
                .andExpect(status().isCreated());

        LoginRequest loginReq = new LoginRequest(username, password);
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk())
                .andReturn();

        return (MockHttpSession) loginResult.getRequest().getSession(false);
    }

    private record CreatedPaste(String id, String shareToken) {}

    private CreatedPaste createPasteWithToken(String content, String language, Visibility visibility, ExpirationPolicy expiration, String password, MockHttpSession session) throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Test Paste", content, language, visibility, expiration, password);
        var reqBuilder = post("/api/v1/pastes")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req));
        if (session != null) {
            reqBuilder.session(session);
        }

        String res = mockMvc.perform(reqBuilder)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        var node = objectMapper.readTree(res);
        String id = node.get("id").asText();
        String shareToken = node.has("shareToken") ? node.get("shareToken").asText() : null;
        return new CreatedPaste(id, shareToken);
    }

    private String createPaste(String content, String language, Visibility visibility, ExpirationPolicy expiration, String password, MockHttpSession session) throws Exception {
        return createPasteWithToken(content, language, visibility, expiration, password, session).id();
    }

    private String createEncryptedPaste(String mode, byte[] wrappedKey) throws Exception {
        byte[] salt = new byte[16];
        byte[] nonce = new byte[12];
        byte[] ciphertext = "encrypted_bytes".getBytes();
        byte[] tag = new byte[16];

        var filePayload = new EncryptedFilePayload(
                "file.txt",
                nonce,
                ciphertext,
                tag
        );

        var payload = new CreateEncryptedPasteRequest(
                List.of(filePayload),
                mode,
                salt,
                600000,
                wrappedKey,
                Instant.now().plus(1, ChronoUnit.DAYS),
                Visibility.PUBLIC,
                "plaintext",
                false,
                null
        );

        String res = mockMvc.perform(post("/api/v1/pastes/encrypted")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(res).get("id").asText();
    }

    // --- CATEGORY 1: HAPPY PATH (6 tests) ---

    @Test
    @DisplayName("T1.1: getSuffix_json_returnsJsonContentTypeAndContent")
    void T1_1_getSuffix_json_returnsJsonContentTypeAndContent() throws Exception {
        String jsonContent = "{\"message\":\"hello world\"}";
        String id = createPaste(jsonContent, "json", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.json", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("application/json")))
                .andExpect(content().string(jsonContent));
    }

    @Test
    @DisplayName("T1.2: getSuffix_yaml_returnsYamlContentType")
    void T1_2_getSuffix_yaml_returnsYamlContentType() throws Exception {
        String yamlContent = "key: value\nlist:\n  - item1";
        String id = createPaste(yamlContent, "yaml", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.yaml", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("application/yaml")))
                .andExpect(content().string(yamlContent));
    }

    @Test
    @DisplayName("T1.3: getSuffix_md_returnsMarkdownContentType")
    void T1_3_getSuffix_md_returnsMarkdownContentType() throws Exception {
        String mdContent = "# Markdown Heading\n\n- list item";
        String id = createPaste(mdContent, "markdown", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.md", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("text/markdown")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("charset=utf-8")))
                .andExpect(content().string(mdContent));
    }

    @Test
    @DisplayName("T1.4: getSuffix_txt_returnsPlainTextContentType")
    void T1_4_getSuffix_txt_returnsPlainTextContentType() throws Exception {
        String txtContent = "Simple plain text content";
        String id = createPaste(txtContent, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("text/plain")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("charset=utf-8")))
                .andExpect(content().string(txtContent));
    }

    @Test
    @DisplayName("T1.5: getSuffix_csv_returnsCsvContentType")
    void T1_5_getSuffix_csv_returnsCsvContentType() throws Exception {
        String csvContent = "id,name,value\n1,alpha,100\n2,beta,200";
        String id = createPaste(csvContent, "csv", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.csv", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("text/csv")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("charset=utf-8")))
                .andExpect(content().string(csvContent));
    }

    @Test
    @DisplayName("T1.6: getSuffix_xml_returnsXmlContentType")
    void T1_6_getSuffix_xml_returnsXmlContentType() throws Exception {
        String xmlContent = "<note><to>User</to><from>ExtraBin</from></note>";
        String id = createPaste(xmlContent, "xml", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.xml", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("application/xml")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("charset=utf-8")))
                .andExpect(content().string(xmlContent));
    }

    // --- CATEGORY 2: AUTH & AUTHORIZATION (4 tests) ---

    @Test
    @DisplayName("T2.1: getSuffix_privatePaste_anonymous_returns404")
    void T2_1_getSuffix_privatePaste_anonymous_returns404() throws Exception {
        MockHttpSession aliceSession = registerAndLogin("alice_priv");
        String id = createPaste("Secret Private", "plaintext", Visibility.PRIVATE, ExpirationPolicy.ONE_DAY, null, aliceSession);

        mockMvc.perform(get("/api/v1/pastes/{id}.json", id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T2.2: getSuffix_privatePaste_nonOwner_returns404")
    void T2_2_getSuffix_privatePaste_nonOwner_returns404() throws Exception {
        MockHttpSession aliceSession = registerAndLogin("alice_p2");
        String id = createPaste("Alice Private", "plaintext", Visibility.PRIVATE, ExpirationPolicy.ONE_DAY, null, aliceSession);

        MockHttpSession bobSession = registerAndLogin("bob_p2");
        mockMvc.perform(get("/api/v1/pastes/{id}.json", id).session(bobSession))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T2.3: getSuffix_privatePaste_owner_returns200")
    void T2_3_getSuffix_privatePaste_owner_returns200() throws Exception {
        MockHttpSession aliceSession = registerAndLogin("alice_p3");
        String content = "Alice Private Data for API";
        String id = createPaste(content, "plaintext", Visibility.PRIVATE, ExpirationPolicy.ONE_DAY, null, aliceSession);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(content().string(content));
    }

    @Test
    @DisplayName("T2.4: getSuffix_unlistedPaste_anonymous_returns200")
    void T2_4_getSuffix_unlistedPaste_anonymous_returns200() throws Exception {
        String content = "Unlisted Content for API";
        CreatedPaste created = createPasteWithToken(content, "plaintext", Visibility.UNLISTED, ExpirationPolicy.ONE_DAY, null, null);

        // Without token -> 404 Not Found (ADR-005 anti-oracle non-disclosure)
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", created.id()))
                .andExpect(status().isNotFound());

        // With valid token -> 200 OK
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", created.id()).param("token", created.shareToken()))
                .andExpect(status().isOk())
                .andExpect(content().string(content));
    }

    // --- CATEGORY 3: ENCRYPTED PASTES (3 tests) ---

    @Test
    @DisplayName("T3.1: getSuffix_encryptedPaste_returns404")
    void T3_1_getSuffix_encryptedPaste_returns404() throws Exception {
        String id = createEncryptedPaste("LINK", null);

        mockMvc.perform(get("/api/v1/pastes/{id}.json", id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T3.2: getSuffix_encryptedPasteWithRawKey_returns404")
    void T3_2_getSuffix_encryptedPasteWithRawKey_returns404() throws Exception {
        String id = createEncryptedPaste("LINK", null);

        mockMvc.perform(get("/api/v1/pastes/{id}.json", id)
                        .header("X-Link-Key", "dummykey1234567890abcdef"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T3.3: getSuffix_passphrasePaste_returns404")
    void T3_3_getSuffix_passphrasePaste_returns404() throws Exception {
        String id = createEncryptedPaste("PASSPHRASE", null);

        mockMvc.perform(get("/api/v1/pastes/{id}.json", id)
                        .header("X-Paste-Password", "testpassphrase"))
                .andExpect(status().isNotFound());
    }

    // --- CATEGORY 4: FAILURE MODES (7 tests) ---

    @Test
    @DisplayName("T4.1: getSuffix_unsupportedSuffix_returns404")
    void T4_1_getSuffix_unsupportedSuffix_returns404() throws Exception {
        String id = createPaste("Executable code", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.exe", id))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/pastes/{id}.foo", id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T4.2: getSuffix_nonExistentPaste_returns404")
    void T4_2_getSuffix_nonExistentPaste_returns404() throws Exception {
        mockMvc.perform(get("/api/v1/pastes/nonexistent-id.json"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    @DisplayName("T4.3: getSuffix_expiredPaste_returns404")
    void T4_3_getSuffix_expiredPaste_returns404() throws Exception {
        Paste expired = new Paste(
                "expTest99",
                null,
                "Expired Paste Title",
                "Expired Content",
                "plaintext",
                Visibility.PUBLIC,
                15,
                1,
                null,
                Instant.now().minus(10, ChronoUnit.MINUTES)
        );
        pasteRepository.save(expired);

        mockMvc.perform(get("/api/v1/pastes/expTest99.json"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T4.4: getSuffix_burnAfterRead_firstReadSucceeds_secondRead404")
    void T4_4_getSuffix_burnAfterRead_firstReadSucceeds_secondRead404() throws Exception {
        String content = "Burn after reading content";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.BURN_AFTER_READING, null, null);

        // First read succeeds
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andExpect(content().string(content));

        // Second read returns 404
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T4.5: getSuffix_pasteWithoutContent_returns404OrEmpty")
    void T4_5_getSuffix_pasteWithoutContent_returns404OrEmpty() throws Exception {
        Paste paste = new Paste("empty-" + UUID.randomUUID().toString().substring(0, 8), null, "Empty Paste", "", "plaintext", Visibility.PUBLIC, 0, 0, null, Instant.now().plus(1, ChronoUnit.DAYS));
        paste = pasteRepository.save(paste);
        String id = paste.getPublicId();

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andExpect(content().string(""));
    }

    @Test
    @DisplayName("T4.6: getSuffix_idContainingDot_returns404")
    void T4_6_getSuffix_idContainingDot_returns404() throws Exception {
        mockMvc.perform(get("/api/v1/pastes/abc.def.json"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T4.7: burnAfterRead_conditionalRequest_returns404")
    void T4_7_burnAfterRead_conditionalRequest_returns404() throws Exception {
        String content = "Burn secret once";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.BURN_AFTER_READING, null, null);

        // First read gets 200 and captures ETag
        MvcResult res = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andReturn();
        String etag = res.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(etag).isNotNull();

        // Second read with If-None-Match MUST return 404, NEVER 304 (304 is unreachable for burned pastes)
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotFound());
    }

    // --- CATEGORY 5: ETAG & CACHE (6 tests) ---

    @Test
    @DisplayName("T5.1: etag_present_onSuccess")
    void T5_1_etag_present_onSuccess() throws Exception {
        String id = createPaste("ETag validation content", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        MvcResult res = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andReturn();

        String etag = res.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(etag).matches("^\"[A-Za-z0-9_-]+\"$");
    }

    @Test
    @DisplayName("T5.2: etag_stable_acrossRequests")
    void T5_2_etag_stable_acrossRequests() throws Exception {
        String id = createPaste("Stable ETag test", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        String etag1 = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        String etag2 = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        assertThat(etag1).isNotNull().isEqualTo(etag2);
    }

    @Test
    @DisplayName("T5.3: etag_changesWhenContentChanges")
    void T5_3_etag_changesWhenContentChanges() throws Exception {
        MockHttpSession session = registerAndLogin("etag_user");
        String id = createPaste("Initial content", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, session);

        String etag1 = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        // Edit paste via account edit endpoint
        EditPasteRequest edit = new EditPasteRequest("Test Paste", "Updated content", "plaintext", Visibility.PUBLIC, 0L);
        mockMvc.perform(put("/api/v1/account/pastes/{id}", id)
                        .session(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(edit)))
                .andExpect(status().isOk());

        String etag2 = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        assertThat(etag1).isNotNull();
        assertThat(etag2).isNotNull();
        assertThat(etag1).isNotEqualTo(etag2);
    }

    @Test
    @DisplayName("T5.4: ifNoneMatch_matching_returns304")
    void T5_4_ifNoneMatch_matching_returns304() throws Exception {
        String id = createPaste("Cache conditional test", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        MvcResult firstRes = mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isOk())
                .andReturn();
        String etag = firstRes.getResponse().getHeader(HttpHeaders.ETAG);
        String cacheControl = firstRes.getResponse().getHeader(HttpHeaders.CACHE_CONTROL);

        // Conditional request with matching If-None-Match
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).header(HttpHeaders.IF_NONE_MATCH, etag))
                .andExpect(status().isNotModified())
                .andExpect(content().string(""))
                .andExpect(header().string(HttpHeaders.ETAG, etag))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, cacheControl));
    }

    @Test
    @DisplayName("T5.5: ifNoneMatch_nonMatching_returns200")
    void T5_5_ifNoneMatch_nonMatching_returns200() throws Exception {
        String content = "Non-matching ETag test";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id).header(HttpHeaders.IF_NONE_MATCH, "\"wrong-etag-val\""))
                .andExpect(status().isOk())
                .andExpect(content().string(content));
    }

    @Test
    @DisplayName("T5.6: cacheControl_perVisibility")
    void T5_6_cacheControl_perVisibility() throws Exception {
        // 1. PUBLIC anonymous -> public, max-age=300, must-revalidate
        String pubId = createPaste("Public content", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", pubId))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "public, max-age=300, must-revalidate"));

        // 2. UNLISTED anonymous -> private, no-cache (with valid share token)
        CreatedPaste unlisted = createPasteWithToken("Unlisted content", "plaintext", Visibility.UNLISTED, ExpirationPolicy.ONE_DAY, null, null);
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", unlisted.id()).param("token", unlisted.shareToken()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-cache"));

        // 3. PRIVATE owner request -> private, no-store
        MockHttpSession aliceSession = registerAndLogin("alice_cache");
        String privId = createPaste("Private content", "plaintext", Visibility.PRIVATE, ExpirationPolicy.ONE_DAY, null, aliceSession);
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", privId).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store"));

        // 4. Authenticated request to PUBLIC paste -> private, no-store
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", pubId).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store"));
    }

    // --- CATEGORY 6: REGRESSION (4 tests) ---

    @Test
    @DisplayName("T6.1: existingJsonViewUnchanged")
    void T6_1_existingJsonViewUnchanged() throws Exception {
        String content = "Standard JSON view content";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("application/json")))
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.files[0].content").value(content));
    }

    @Test
    @DisplayName("T6.2: existingRawEndpointUnchanged")
    void T6_2_existingRawEndpointUnchanged() throws Exception {
        String content = "Raw endpoint content";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString("text/plain")))
                .andExpect(content().string(content));
    }

    @Test
    @DisplayName("T6.3: existingDownloadEndpointUnchanged")
    void T6_3_existingDownloadEndpointUnchanged() throws Exception {
        String content = "Download endpoint content";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("attachment")))
                .andExpect(content().string(content));
    }

    @Test
    @DisplayName("T6.4: pathMatching_doesNotStealSuffixes")
    void T6_4_pathMatching_doesNotStealSuffixes() throws Exception {
        String content = "Path matching priority test";
        String id = createPaste(content, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, null);

        // /raw must still match the raw endpoint, not /{id}.{ext}
        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().string(content));
    }

    // --- CATEGORY 7: SECURITY (2 tests) ---

    @Test
    @DisplayName("T7.1: getSuffix_doesNotLeakOwnerId")
    void T7_1_getSuffix_doesNotLeakOwnerId() throws Exception {
        MockHttpSession aliceSession = registerAndLogin("alice_sec");
        String id = createPaste("{\"data\":\"valuable\"}", "json", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null, aliceSession);

        mockMvc.perform(get("/api/v1/pastes/{id}.json", id))
                .andExpect(status().isOk())
                .andExpect(content().string("{\"data\":\"valuable\"}"))
                .andExpect(content().string(not(containsString("userId"))))
                .andExpect(content().string(not(containsString("user_id"))))
                .andExpect(content().string(not(containsString("alice_sec"))));
    }

    @Test
    @DisplayName("T7.2: getSuffix_doesNotServeRawPasswordHash")
    void T7_2_getSuffix_doesNotServeRawPasswordHash() throws Exception {
        String id = createPaste("Password guarded content", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, "SecretP@ss1", null);

        // GET without password must return 401 Unauthorized, never leaking password hash
        mockMvc.perform(get("/api/v1/pastes/{id}.txt", id))
                .andExpect(status().isUnauthorized())
                .andExpect(content().string(not(containsString("passwordHash"))));
    }
}
