package com.pastebin;

import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreatePasteResponse;
import com.pastebin.paste.api.dto.PasteFileRequest;
import com.pastebin.paste.application.PasteService;
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

import java.util.List;
import java.util.concurrent.*;
import com.pastebin.identity.domain.User;
import com.pastebin.paste.api.dto.EditPasteFileItemRequest;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteFile;
import com.pastebin.paste.domain.PasteRevision;
import org.springframework.mock.web.MockHttpSession;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.test.web.servlet.MvcResult;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class MultiFileWorkspaceIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PasteService pasteService;

    @Autowired
    private com.pastebin.identity.infrastructure.UserRepository userRepository;

    @Autowired
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @Autowired
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Autowired
    private com.pastebin.paste.infrastructure.PasteRepository pasteRepository;

    @Autowired
    private com.pastebin.paste.infrastructure.PasteRevisionRepository pasteRevisionRepository;

    @Autowired
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        rateLimiterService.clear();
    }

    // BE-WS-RAW-01: GET /api/v1/pastes/{id}/files/by-id/{fileId}/raw retrieves exact file by numeric ID
    @Test
    @DisplayName("BE-WS-RAW-01: Retrieves raw content by numeric file ID")
    void testGetRawFileByNumericId() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Multi Test",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(
                        new PasteFileRequest("file1.txt", "Content of File One\n", "plaintext"),
                        new PasteFileRequest("file2.py", "print('hello from file two')\n", "python")
                ),
                null,
                null,
                null
        );

        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");
        var view = pasteService.getPasteView(created.id(), null, null, "127.0.0.1");
        assertThat(view.files()).hasSize(2);

        Long firstFileId = view.files().get(0).id();
        Long secondFileId = view.files().get(1).id();
        assertThat(firstFileId).isNotNull();
        assertThat(secondFileId).isNotNull();

        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + firstFileId + "/raw"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().string("Content of File One\n"));

        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + secondFileId + "/raw"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(content().string("print('hello from file two')\n"));
    }

    // BE-WS-RAW-02: GET /api/v1/pastes/{id}/files/by-id/{fileId}/download sets attachment header with sanitized filename
    @Test
    @DisplayName("BE-WS-RAW-02: Downloads file by numeric ID with attachment disposition")
    void testDownloadFileByNumericId() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Download Test",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(
                        new PasteFileRequest("special script.sh", "echo 'running'\n", "bash")
                ),
                null,
                null,
                null
        );

        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");
        var view = pasteService.getPasteView(created.id(), null, null, "127.0.0.1");
        Long fileId = view.files().get(0).id();

        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + fileId + "/download"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("special script.sh")))
                .andExpect(content().string("echo 'running'\n"));
    }

    // BE-WS-RAW-03: Non-existent fileId or cross-paste fileId returns 404 Problem Details
    @Test
    @DisplayName("BE-WS-RAW-03: Non-existent or cross-paste file ID returns 404")
    void testNonExistentOrCrossPasteFileIdReturns404() throws Exception {
        CreatePasteRequest requestA = new CreatePasteRequest(
                "Paste A",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(new PasteFileRequest("alpha.txt", "Alpha content", "plaintext")),
                null,
                null,
                null
        );
        CreatePasteResponse createdA = pasteService.createPaste(requestA, null, "127.0.0.1");
        var viewA = pasteService.getPasteView(createdA.id(), null, null, "127.0.0.1");
        Long fileIdA = viewA.files().get(0).id();

        CreatePasteRequest requestB = new CreatePasteRequest(
                "Paste B",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(new PasteFileRequest("beta.txt", "Beta content", "plaintext")),
                null,
                null,
                null
        );
        CreatePasteResponse createdB = pasteService.createPaste(requestB, null, "127.0.0.1");

        // Non-existent ID 999999
        mockMvc.perform(get("/api/v1/pastes/" + createdA.id() + "/files/by-id/999999/raw"))
                .andExpect(status().isNotFound());

        // Cross-paste ID: fileIdA requested under createdB.id()
        mockMvc.perform(get("/api/v1/pastes/" + createdB.id() + "/files/by-id/" + fileIdA + "/raw"))
                .andExpect(status().isNotFound());
    }

    // BE-WS-RAW-04: Filename endpoint /files/{filename}/raw strictly matches filename and preserves existing semantics
    @Test
    @DisplayName("BE-WS-RAW-04: Existing filename route strictly matches filename")
    void testFilenameRouteStrictlyMatchesFilename() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Filename Test",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(
                        new PasteFileRequest("101", "Content of file named 101\n", "plaintext"),
                        new PasteFileRequest("other.txt", "Other content\n", "plaintext")
                ),
                null,
                null,
                null
        );
        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");

        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/101/raw"))
                .andExpect(status().isOk())
                .andExpect(content().string("Content of file named 101\n"));
    }

    // BE-WS-SEC-01: Private paste direct file ID endpoints reject unauthenticated or non-owner requests with 404
    @Test
    @DisplayName("BE-WS-SEC-01: Private paste direct file ID endpoints reject non-owner requests with 404")
    void testPrivatePasteDirectFileIdRejectsNonOwner() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Private Secret",
                null,
                "plaintext",
                Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(new PasteFileRequest("secret.env", "DB_PASS=xyz\n", "plaintext")),
                null,
                null,
                null
        );
        var owner = userRepository.findByUsername("priv_owner_test")
                .orElseGet(() -> userRepository.save(new com.pastebin.identity.domain.User("priv_owner_test", "priv_owner@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        CreatePasteResponse created = pasteService.createPaste(request, owner.getId(), "127.0.0.1");
        var view = pasteService.getPasteView(created.id(), owner.getId(), null, "127.0.0.1");
        Long fileId = view.files().get(0).id();

        // Anonymous unauthenticated attempt
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + fileId + "/raw"))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + fileId + "/download"))
                .andExpect(status().isNotFound());
    }

    // BE-WS-SEC-02: Unlisted paste direct file ID endpoints reject requests with missing or invalid share tokens
    @Test
    @DisplayName("BE-WS-SEC-02: Unlisted paste file ID endpoints reject requests with invalid or missing share tokens")
    void testUnlistedPasteFileIdRejectsInvalidShareToken() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Unlisted Paste",
                null,
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY,
                null,
                List.of(new PasteFileRequest("unlisted.txt", "Unlisted file data\n", "plaintext")),
                null,
                null,
                null
        );
        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");
        String validToken = created.shareToken();
        assertThat(validToken).isNotNull();

        var view = pasteService.getPasteView(created.id(), null, null, "127.0.0.1", false, validToken);
        Long fileId = view.files().get(0).id();

        // Missing token -> 404
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + fileId + "/raw"))
                .andExpect(status().isNotFound());

        // Invalid token -> 404
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + fileId + "/raw?token=shr_invalidfake1234567890"))
                .andExpect(status().isNotFound());

        // Valid token -> 200
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/files/by-id/" + fileId + "/raw?token=" + validToken))
                .andExpect(status().isOk())
                .andExpect(content().string("Unlisted file data\n"));
    }

    // BE-WS-BAR-01: Dedicated view-once lifecycle test
    @Test
    @DisplayName("BE-WS-BAR-01: Dedicated view-once lifecycle: unauthorized cannot consume; first authorized consumes; subsequent server calls return 404")
    void testBurnAfterReadingLifecycle() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Burn After Reading Test",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE,
                "passcode123",
                List.of(new PasteFileRequest("viewonce.txt", "Top secret view once message\n", "plaintext")),
                null,
                null,
                null
        );
        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");

        // 1. Unauthorized attempt (wrong password) -> returns 401 Unauthorized, does NOT consume paste
        mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Paste-Password", "wrongpassword"))
                .andExpect(status().isUnauthorized());

        // 2. First authorized request (correct password) -> consumes paste and returns 200
        mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Paste-Password", "passcode123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.burnAfterReading").value(true));

        // 3. Subsequent request to getPaste -> returns 404
        mockMvc.perform(get("/api/v1/pastes/" + created.id())
                        .header("X-Paste-Password", "passcode123"))
                .andExpect(status().isNotFound());

        // 4. Subsequent request to raw endpoint -> returns 404
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/raw")
                        .header("X-Paste-Password", "passcode123"))
                .andExpect(status().isNotFound());

        // 5. Subsequent request to download-zip endpoint -> returns 404
        mockMvc.perform(get("/api/v1/pastes/" + created.id() + "/download-zip")
                        .header("X-Paste-Password", "passcode123"))
                .andExpect(status().isNotFound());
    }

    // BE-WS-CON-01: Real concurrency test against PostgreSQL repository
    @Test
    @DisplayName("BE-WS-CON-01: Concurrent requests to burn-after-reading paste: exactly one succeeds (200), all others receive 404")
    void testConcurrentBurnAfterReadingRace() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Concurrent Burn Test",
                null,
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE,
                null,
                List.of(new PasteFileRequest("race.txt", "Atomic consumption proof\n", "plaintext")),
                null,
                null,
                null
        );
        CreatePasteResponse created = pasteService.createPaste(request, null, "127.0.0.1");

        int concurrency = 10;
        ExecutorService executor = Executors.newFixedThreadPool(concurrency);
        CountDownLatch readyLatch = new CountDownLatch(concurrency);
        CountDownLatch startLatch = new CountDownLatch(1);

        AtomicInteger status200Count = new AtomicInteger(0);
        AtomicInteger status404Count = new AtomicInteger(0);
        AtomicInteger otherStatusCount = new AtomicInteger(0);

        List<Future<?>> futures = new java.util.ArrayList<>();
        for (int i = 0; i < concurrency; i++) {
            futures.add(executor.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    var result = mockMvc.perform(get("/api/v1/pastes/" + created.id())).andReturn();
                    int status = result.getResponse().getStatus();
                    if (status == 200) {
                        status200Count.incrementAndGet();
                    } else if (status == 404) {
                        status404Count.incrementAndGet();
                    } else {
                        otherStatusCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }));
        }

        readyLatch.await(5, TimeUnit.SECONDS);
        startLatch.countDown(); // Release all threads concurrently

        for (Future<?> f : futures) {
            f.get(10, TimeUnit.SECONDS);
        }
        executor.shutdown();

        assertThat(otherStatusCount.get()).isEqualTo(0);
        assertThat(status200Count.get()).isEqualTo(1);
        assertThat(status404Count.get()).isEqualTo(concurrency - 1);
    }

    private MockHttpSession createAuthenticatedUserSession(String username) throws Exception {
        String email = username + "@example.com";
        String password = "Password123!";
        if (!userRepository.existsByUsername(username)) {
            User user = new User(username, email, passwordEncoder.encode(password), "USER");
            userRepository.save(user);
        }
        var loginReq = new com.pastebin.identity.api.dto.LoginRequest(username, password);
        MvcResult res = mockMvc.perform(post("/api/v1/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) res.getRequest().getSession();
    }

    // BE-EDT-01: Updating single-file paste in place preserves existing PasteFile.id
    @Test
    @DisplayName("BE-EDT-01: Updating a single-file paste preserves its existing file ID")
    void testSingleFileUpdatePreservesFileId() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("alice_single");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Initial Single", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("main.txt", "Original content", "plaintext")),
                null, null, null
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        Paste before = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long originalFileId = before.getFiles().get(0).getId();

        EditPasteRequest editReq = new EditPasteRequest(
                "Updated Single", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(originalFileId, "main.txt", "Updated content", "plaintext"))
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isOk());

        Paste after = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(after.getFiles()).hasSize(1);
        assertThat(after.getFiles().get(0).getId()).isEqualTo(originalFileId);
        assertThat(after.getFiles().get(0).getContent()).isEqualTo("Updated content");
    }

    // BE-EDT-02: Editing one multi-file entry preserves every unaffected file ID and its content
    @Test
    @DisplayName("BE-EDT-02: Editing one multi-file entry preserves every unaffected file ID and content")
    void testMultiFileUpdatePreservesUnaffectedFileIds() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("bob_multi");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Multi Project", null, "typescript", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(
                        new PasteFileRequest("file1.ts", "content 1", "typescript"),
                        new PasteFileRequest("file2.py", "content 2", "python"),
                        new PasteFileRequest("file3.md", "content 3", "markdown")
                ),
                null, null, null
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        Paste before = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long id1 = before.getFiles().get(0).getId();
        Long id2 = before.getFiles().get(1).getId();
        Long id3 = before.getFiles().get(2).getId();

        // Edit file1 only, pass complete snapshot preserving id1, id2, id3
        EditPasteRequest editReq = new EditPasteRequest(
                "Multi Project", null, "typescript", Visibility.PUBLIC, 0L,
                List.of(
                        new EditPasteFileItemRequest(id1, "file1.ts", "content 1 MODIFIED", "typescript"),
                        new EditPasteFileItemRequest(id2, "file2.py", "content 2", "python"),
                        new EditPasteFileItemRequest(id3, "file3.md", "content 3", "markdown")
                )
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isOk());

        Paste after = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(after.getFiles()).hasSize(3);
        assertThat(after.getFiles().get(0).getId()).isEqualTo(id1);
        assertThat(after.getFiles().get(0).getContent()).isEqualTo("content 1 MODIFIED");
        assertThat(after.getFiles().get(1).getId()).isEqualTo(id2);
        assertThat(after.getFiles().get(1).getContent()).isEqualTo("content 2");
        assertThat(after.getFiles().get(2).getId()).isEqualTo(id3);
        assertThat(after.getFiles().get(2).getContent()).isEqualTo("content 3");
    }

    // BE-EDT-03: Renaming an existing file preserves its numeric ID
    @Test
    @DisplayName("BE-EDT-03: Renaming an existing file preserves its numeric file ID")
    void testRenamingExistingFilePreservesFileId() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("carol_rename");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Rename Demo", null, "typescript", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("index.ts", "console.log('original');", "typescript")),
                null, null, null
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        Paste before = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long originalFileId = before.getFiles().get(0).getId();

        // Rename index.ts to main.ts preserving originalFileId
        EditPasteRequest editReq = new EditPasteRequest(
                "Rename Demo", null, "typescript", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(originalFileId, "main.ts", "console.log('original');", "typescript"))
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isOk());

        Paste after = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(after.getFiles().get(0).getId()).isEqualTo(originalFileId);
        assertThat(after.getFiles().get(0).getFilename()).isEqualTo("main.ts");
    }

    // BE-EDT-04: Omitting files on multi-file paste returns 400 Bad Request
    @Test
    @DisplayName("BE-EDT-04: Omitting 'files' payload cannot silently destroy a multi-file workspace")
    void testOmittedFilesPayloadRejectsMultiFileDestruction() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("dan_omitted");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Multi Protection", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(
                        new PasteFileRequest("f1.txt", "one", "plaintext"),
                        new PasteFileRequest("f2.txt", "two", "plaintext")
                ),
                null, null, null
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // Attempt edit with files = null (legacy format) on multi-file paste
        EditPasteRequest editReq = new EditPasteRequest("Modified", "one content", "plaintext", Visibility.PUBLIC, 0L);

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("complete files snapshot is required")));
    }

    // BE-EDT-05: Empty files list [] returns 400 Bad Request
    @Test
    @DisplayName("BE-EDT-05: Empty files list returns 400 Bad Request")
    void testEmptyFilesListRejectsWithBadRequest() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("erin_empty");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Empty Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("f1.txt", "one", "plaintext")),
                null, null, null
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        EditPasteRequest editReq = new EditPasteRequest(
                "Empty Test", null, "plaintext", Visibility.PUBLIC, 0L, List.of()
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isBadRequest());
    }

    // BE-EDT-06: Duplicate file IDs and duplicate filenames are rejected
    @Test
    @DisplayName("BE-EDT-06: Duplicate file IDs and duplicate filenames are rejected with 400")
    void testDuplicateFileIdsAndFilenamesRejected() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("frank_dups");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Dup Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(
                        new PasteFileRequest("a.txt", "a", "plaintext"),
                        new PasteFileRequest("b.txt", "b", "plaintext")
                ),
                null, null, null
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        Paste p = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long fileId = p.getFiles().get(0).getId();

        // 1. Duplicate IDs
        EditPasteRequest dupIdReq = new EditPasteRequest(
                "Dup Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(
                        new EditPasteFileItemRequest(fileId, "one.txt", "content", "plaintext"),
                        new EditPasteFileItemRequest(fileId, "two.txt", "content", "plaintext")
                )
        );
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dupIdReq)))
                .andExpect(status().isBadRequest());

        // 2. Duplicate filenames (case-insensitive)
        EditPasteRequest dupNameReq = new EditPasteRequest(
                "Dup Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(
                        new EditPasteFileItemRequest(null, "README.md", "content", "markdown"),
                        new EditPasteFileItemRequest(null, "readme.md", "content 2", "markdown")
                )
        );
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dupNameReq)))
                .andExpect(status().isBadRequest());
    }

    // BE-EDT-07: Submitting file ID from another paste is rejected
    @Test
    @DisplayName("BE-EDT-07: Submitting a foreign paste file ID is rejected with 400")
    void testForeignPasteFileIdRejected() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("grace_hijack");
        CreatePasteRequest p1Req = new CreatePasteRequest(
                "Paste 1", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("p1.txt", "p1", "plaintext")), null, null, null
        );
        CreatePasteRequest p2Req = new CreatePasteRequest(
                "Paste 2", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("p2.txt", "p2", "plaintext")), null, null, null
        );

        String id1 = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(p1Req))).andReturn().getResponse().getContentAsString()).get("id").asText();
        String id2 = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(p2Req))).andReturn().getResponse().getContentAsString()).get("id").asText();

        Paste p1 = pasteRepository.findActiveByPublicIdWithFiles(id1, java.time.Instant.now()).orElseThrow();
        Long file1Id = p1.getFiles().get(0).getId();

        // Attempt to edit paste 2 while passing file1Id belonging to paste 1
        EditPasteRequest hijackReq = new EditPasteRequest(
                "Paste 2", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(file1Id, "p2.txt", "hijacked", "plaintext"))
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + id2)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(hijackReq)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.containsString("does not belong to this paste")));
    }

    // BE-EDT-08: Stale version fails atomically with 409 Conflict
    @Test
    @DisplayName("BE-EDT-08: Stale version fails atomically with 409 Conflict")
    void testStaleVersionFailsAtomicallyWithConflict() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("heidi_version");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Version Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("v.txt", "v0", "plaintext")), null, null, null
        );
        String pasteId = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(createReq))).andReturn().getResponse().getContentAsString()).get("id").asText();

        Paste p0 = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long fileId = p0.getFiles().get(0).getId();

        // First edit advances version 0 -> 1
        EditPasteRequest edit1 = new EditPasteRequest("V1", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(fileId, "v.txt", "v1", "plaintext")));
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(edit1)))
                .andExpect(status().isOk());

        // Stale edit using version 0 should fail with 409 Conflict
        EditPasteRequest staleEdit = new EditPasteRequest("Stale", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(fileId, "v.txt", "stale content", "plaintext")));
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(staleEdit)))
                .andExpect(status().isConflict());

        Paste pFinal = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(pFinal.getFiles().get(0).getContent()).isEqualTo("v1");
    }

    // BE-EDT-09: Synchronized concurrent edits on same version collide at database flush; exactly one commits and loser receives 409
    @Test
    @DisplayName("BE-EDT-09: Synchronized concurrent edits collide; exactly one commits and loser receives 409")
    void testSimultaneousEditsCannotSilentlyOverwrite() throws Exception {
        MockHttpSession session1 = createAuthenticatedUserSession("ivan_race_1");
        MockHttpSession session2 = createAuthenticatedUserSession("ivan_race_2");

        // Paste owned by ivan_race_1
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Race Workspace", null, "typescript", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(
                        new PasteFileRequest("f1.ts", "initial 1", "typescript"),
                        new PasteFileRequest("f2.py", "initial 2", "python")
                ), null, null, null
        );
        String pasteId = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session1).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(createReq))).andReturn().getResponse().getContentAsString()).get("id").asText();

        Paste pInitial = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long fid1 = pInitial.getFiles().get(0).getId();
        Long fid2 = pInitial.getFiles().get(1).getId();

        CountDownLatch bothReadyLatch = new CountDownLatch(2);
        CountDownLatch startLatch = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger conflictCount = new AtomicInteger(0);

        ExecutorService executor = Executors.newFixedThreadPool(2);

        Callable<Integer> tx1 = () -> {
            bothReadyLatch.countDown();
            bothReadyLatch.await(5, TimeUnit.SECONDS);
            startLatch.await(5, TimeUnit.SECONDS);

            EditPasteRequest req = new EditPasteRequest(
                    "Race Workspace", null, "typescript", Visibility.PUBLIC, 0L,
                    List.of(
                            new EditPasteFileItemRequest(fid1, "f1.ts", "thread 1 edit", "typescript"),
                            new EditPasteFileItemRequest(fid2, "f2.py", "initial 2", "python")
                    )
            );
            MvcResult res = mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                    .session(session1).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(req)))
                    .andReturn();
            int st = res.getResponse().getStatus();
            if (st == 200) successCount.incrementAndGet();
            if (st == 409) conflictCount.incrementAndGet();
            return st;
        };

        Callable<Integer> tx2 = () -> {
            bothReadyLatch.countDown();
            bothReadyLatch.await(5, TimeUnit.SECONDS);
            startLatch.await(5, TimeUnit.SECONDS);

            EditPasteRequest req = new EditPasteRequest(
                    "Race Workspace", null, "typescript", Visibility.PUBLIC, 0L,
                    List.of(
                            new EditPasteFileItemRequest(fid1, "f1.ts", "initial 1", "typescript"),
                            new EditPasteFileItemRequest(fid2, "f2.py", "thread 2 edit", "python")
                    )
            );
            MvcResult res = mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                    .session(session1).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(req)))
                    .andReturn();
            int st = res.getResponse().getStatus();
            if (st == 200) successCount.incrementAndGet();
            if (st == 409) conflictCount.incrementAndGet();
            return st;
        };

        Future<Integer> f1 = executor.submit(tx1);
        Future<Integer> f2 = executor.submit(tx2);

        bothReadyLatch.await(5, TimeUnit.SECONDS);
        startLatch.countDown();

        f1.get(10, TimeUnit.SECONDS);
        f2.get(10, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(successCount.get()).isEqualTo(1);
        assertThat(conflictCount.get()).isEqualTo(1);

        Paste pFinal = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(pFinal.getVersion()).isEqualTo(1L);
    }

    // BE-EDT-10: Submitted order in files snapshot is authoritative for sort_order
    @Test
    @DisplayName("BE-EDT-10: Submitted order in files snapshot is authoritative for sort_order")
    void testSubmittedOrderIsAuthoritativeForSortOrder() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("judy_order");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Order Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(
                        new PasteFileRequest("first.txt", "1", "plaintext"),
                        new PasteFileRequest("second.txt", "2", "plaintext")
                ), null, null, null
        );
        String pasteId = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(createReq))).andReturn().getResponse().getContentAsString()).get("id").asText();

        Paste p = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long id1 = p.getFiles().get(0).getId();
        Long id2 = p.getFiles().get(1).getId();

        // Swap order: second.txt first, first.txt second
        EditPasteRequest swapReq = new EditPasteRequest(
                "Order Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(
                        new EditPasteFileItemRequest(id2, "second.txt", "2", "plaintext"),
                        new EditPasteFileItemRequest(id1, "first.txt", "1", "plaintext")
                )
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(swapReq)))
                .andExpect(status().isOk());

        Paste pSwapped = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(pSwapped.getFiles().get(0).getId()).isEqualTo(id2);
        assertThat(pSwapped.getFiles().get(0).getSortOrder()).isEqualTo(0);
        assertThat(pSwapped.getFiles().get(1).getId()).isEqualTo(id1);
        assertThat(pSwapped.getFiles().get(1).getSortOrder()).isEqualTo(1);
    }

    // BE-EDT-11: Filename reused from deleted file is allowed
    @Test
    @DisplayName("BE-EDT-11: Filename reused from deleted file is allowed")
    void testFilenameReusedFromDeletedFileAllowed() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("ken_reuse");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Reuse Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("temp.txt", "old data", "plaintext")), null, null, null
        );
        String pasteId = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(createReq))).andReturn().getResponse().getContentAsString()).get("id").asText();

        Paste p = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        Long oldId = p.getFiles().get(0).getId();

        // Delete oldId by omitting it, add brand new file with same filename temp.txt (id == null)
        EditPasteRequest reuseReq = new EditPasteRequest(
                "Reuse Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(null, "temp.txt", "fresh new data", "plaintext"))
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reuseReq)))
                .andExpect(status().isOk());

        Paste pAfter = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(pAfter.getFiles()).hasSize(1);
        assertThat(pAfter.getFiles().get(0).getId()).isNotEqualTo(oldId);
        assertThat(pAfter.getFiles().get(0).getFilename()).isEqualTo("temp.txt");
        assertThat(pAfter.getFiles().get(0).getContent()).isEqualTo("fresh new data");
    }

    // BE-EDT-12: Reserved device names and path traversal rejected on edit
    @Test
    @DisplayName("BE-EDT-12: Reserved device names and traversal names are rejected with 400")
    void testFilenameSecurityValidationOnEdit() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("leo_reserved");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Security Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("valid.txt", "valid", "plaintext")), null, null, null
        );
        String pasteId = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(createReq))).andReturn().getResponse().getContentAsString()).get("id").asText();

        // 1. CON.txt reserved
        EditPasteRequest conReq = new EditPasteRequest(
                "Security Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(null, "CON.txt", "data", "plaintext"))
        );
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(conReq)))
                .andExpect(status().isBadRequest());

        // 2. Traversal ../evil.txt
        EditPasteRequest traversalReq = new EditPasteRequest(
                "Security Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(null, "../evil.txt", "data", "plaintext"))
        );
        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(traversalReq)))
                .andExpect(status().isBadRequest());
    }

    // BE-EDT-13: Transactional rollback on payload too large
    @Test
    @DisplayName("BE-EDT-13: Transactional rollback on payload too large")
    void testTransactionalRollbackOnPayloadTooLarge() throws Exception {
        MockHttpSession session = createAuthenticatedUserSession("mallory_large");
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Large Test", null, "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null,
                List.of(new PasteFileRequest("normal.txt", "normal", "plaintext")), null, null, null
        );
        String pasteId = objectMapper.readTree(mockMvc.perform(post("/api/v1/pastes").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(createReq))).andReturn().getResponse().getContentAsString()).get("id").asText();

        // Oversized content exceeding 1MB limit (1048576 bytes)
        String oversized = "x".repeat(1048577);
        EditPasteRequest largeReq = new EditPasteRequest(
                "Large Test", null, "plaintext", Visibility.PUBLIC, 0L,
                List.of(new EditPasteFileItemRequest(null, "oversized.txt", oversized, "plaintext"))
        );

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                .session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(largeReq)))
                .andExpect(status().isPayloadTooLarge());

        // Assert database state was not modified
        Paste pAfter = pasteRepository.findActiveByPublicIdWithFiles(pasteId, java.time.Instant.now()).orElseThrow();
        assertThat(pAfter.getFiles().get(0).getFilename()).isEqualTo("normal.txt");
        assertThat(pAfter.getVersion()).isEqualTo(0L);
    }
}
