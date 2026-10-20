package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.DeleteAnonymousPasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasteSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Test
    void anonymousUser_cannotCreatePrivatePaste() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Secret Paste",
                "secret credentials",
                "plaintext",
                Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void invalidDeletionCapability_isRejectedWithForbidden() throws Exception {
        CreatePasteRequest createRequest = new CreatePasteRequest(
                "Delete Test",
                "content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        String responseJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String pasteId = objectMapper.readTree(responseJson).get("id").asText();

        DeleteAnonymousPasteRequest deleteRequest = new DeleteAnonymousPasteRequest("wrong_capability_token");

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/delete-anonymous")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteRequest)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void expiredPaste_returnsNotFoundAcrossAllEndpoints() throws Exception {
        // Create an expired paste directly in repository
        Paste paste = new Paste(
                "expiredId99",
                null,
                "Expired Paste",
                "Should not be seen",
                "plaintext",
                Visibility.PUBLIC,
                18,
                1,
                null,
                Instant.now().minus(5, ChronoUnit.MINUTES) // Expired 5 minutes ago
        );
        pasteRepository.save(paste);

        // View endpoint
        mockMvc.perform(get("/api/v1/pastes/expiredId99"))
                .andExpect(status().isNotFound());

        // Raw endpoint
        mockMvc.perform(get("/api/v1/pastes/expiredId99/raw"))
                .andExpect(status().isNotFound());

        // Download endpoint
        mockMvc.perform(get("/api/v1/pastes/expiredId99/download"))
                .andExpect(status().isNotFound());
    }

    @Test
    void burnAfterReading_isDeletedAfterFirstView_andReturns404OnSecondView() throws Exception {
        CreatePasteRequest createRequest = new CreatePasteRequest(
                "Self Destruct Note",
                "top secret data",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.BURN_AFTER_READING
        );

        String responseJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String pasteId = objectMapper.readTree(responseJson).get("id").asText();

        // 1. First View: Succeeds and indicates burned
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.content").value("top secret data"))
                .andExpect(jsonPath("$.burnAfterReading").value(true));

        // 2. Second View: Immediately returns 404 Not Found (burned & purged!)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        // 3. Raw endpoint also returns 404
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isNotFound());
    }

    @Test
    void passwordProtectedPaste_requiresPasswordToUnlock_andFailsWithWrongPassword() throws Exception {
        CreatePasteRequest createRequest = new CreatePasteRequest(
                "Classified Note",
                "vault content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                "super-secret-123"
        );

        String responseJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.passwordProtected").value(true))
                .andReturn().getResponse().getContentAsString();

        String pasteId = objectMapper.readTree(responseJson).get("id").asText();

        // 1. Without password: returns metadata but masked content and passwordRequired = true
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.passwordProtected").value(true))
                .andExpect(jsonPath("$.passwordRequired").value(true))
                .andExpect(jsonPath("$.content").value(""));

        // 2. With wrong password: returns 401 Unauthorized
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "wrong-password"))
                .andExpect(status().isUnauthorized());

        // 3. Raw endpoint without password: 401 Unauthorized
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isUnauthorized());

        // 4. With correct password in header: returns full content
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "super-secret-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("vault content"))
                .andExpect(jsonPath("$.passwordRequired").value(false));

        // 5. Raw endpoint with header password: returns plain text
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw")
                        .header("X-Paste-Password", "super-secret-123"))
                .andExpect(status().isOk())
                .andExpect(content().string("vault content"));
    }

    @Test
    void passwordProtectedAndViewOnce_wrongPasswordDoesNotBurn_correctPasswordUnlocksAndBurns() throws Exception {
        CreatePasteRequest createRequest = new CreatePasteRequest(
                "Ultra Secret Mission",
                "mission briefing details",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE,
                "agent-pass-99"
        );

        String responseJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.viewOnce").value(true))
                .andExpect(jsonPath("$.passwordProtected").value(true))
                .andReturn().getResponse().getContentAsString();

        String pasteId = objectMapper.readTree(responseJson).get("id").asText();

        // 1. First visit without password: challenge returned, NOT burned
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(true));

        // 2. Visit with wrong password: 401, NOT burned
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "wrong-agent-pass"))
                .andExpect(status().isUnauthorized());

        // 3. Visit with correct password: UNLOCKED and BURNED!
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "agent-pass-99"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("mission briefing details"))
                .andExpect(jsonPath("$.viewOnce").value(true));

        // 4. Subsequent visit with correct password: 404 Not Found (already burned!)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "agent-pass-99"))
                .andExpect(status().isNotFound());
    }

    @Test
    void honeypotPopulated_rejectsSubmissionWithBadRequest() throws Exception {
        CreatePasteRequest honeypotRequest = new CreatePasteRequest(
                "Bot Submission",
                "malicious or spam content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                null,
                null,
                "https://spam-bot.example.com"
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(honeypotRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Automated submission detected."));
    }

    @Test
    void passwordProtectedPaste_masksFilenamesInPreauthChallenge() throws Exception {
        com.pastebin.paste.api.dto.PasteFileRequest f1 = new com.pastebin.paste.api.dto.PasteFileRequest(
                "super-secret-keys.env",
                "AWS_SECRET=xyz123",
                "plaintext"
        );
        CreatePasteRequest multiFileProtected = new CreatePasteRequest(
                "Sensitive Vault",
                "placeholder",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                "unlock-secret-pass",
                java.util.List.of(f1),
                null,
                null
        );

        String createJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(multiFileProtected)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String pasteId = objectMapper.readTree(createJson).get("id").asText();

        // Pre-auth challenge must NOT leak actual filename "super-secret-keys.env"
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(true))
                .andExpect(jsonPath("$.files[0].filename").value("file-1.txt"))
                .andExpect(jsonPath("$.files[0].filename").value(not(containsString("super-secret-keys"))));
    }

    @Test
    void burnAfterReading_downloadFile_burnsAtomically() throws Exception {
        CreatePasteRequest viewOnceReq = new CreatePasteRequest(
                "One Time Download",
                "single use payload",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE
        );

        String createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(viewOnceReq)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String pasteId = objectMapper.readTree(createRes).get("id").asText();

        // 1. Download file succeeds
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download"))
                .andExpect(status().isOk());

        // 2. Second download must return 404 (burned)
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download"))
                .andExpect(status().isNotFound());
    }

    @Test
    void customSlug_validSlug_createsPasteWithCustomLink() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Custom Slug Paste",
                "custom slug content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                null,
                null,
                null,
                "my-custom-paste-2026"
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("my-custom-paste-2026"));

        mockMvc.perform(get("/api/v1/pastes/my-custom-paste-2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("my-custom-paste-2026"))
                .andExpect(jsonPath("$.content").value("custom slug content"));
    }

    @Test
    void customSlug_duplicateSlug_returnsConflict() throws Exception {
        CreatePasteRequest request1 = new CreatePasteRequest(
                "Original",
                "original content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                null,
                null,
                null,
                "unique-link-xyz"
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request1)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("unique-link-xyz"));

        CreatePasteRequest request2 = new CreatePasteRequest(
                "Duplicate",
                "duplicate content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                null,
                null,
                null,
                "unique-link-xyz"
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request2)))
                .andExpect(status().isConflict());
    }

    @Test
    void customSlug_reservedWordOrInvalidChars_returnsBadRequest() throws Exception {
        CreatePasteRequest reservedReq = new CreatePasteRequest(
                "Reserved",
                "content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                null,
                null,
                null,
                "discovery"
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reservedReq)))
                .andExpect(status().isBadRequest());

        CreatePasteRequest invalidCharReq = new CreatePasteRequest(
                "Invalid",
                "content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                null,
                null,
                null,
                null,
                "bad slug with spaces!"
        );

        mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidCharReq)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateSlug_anonymousWithValidCapability_updatesSuccessfully() throws Exception {
        // 1. Create anonymous paste
        CreatePasteRequest request = new CreatePasteRequest(
                "Initial Title",
                "hello world content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        String createJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String originalId = objectMapper.readTree(createJson).get("id").asText();
        String capability = objectMapper.readTree(createJson).get("deletionCapability").asText();

        // 2. Call PATCH /api/v1/pastes/{id}/slug with capability
        var updateRequest = new com.pastebin.paste.api.dto.UpdateSlugRequest("my-renamed-link", capability);
        mockMvc.perform(patch("/api/v1/pastes/" + originalId + "/slug")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("my-renamed-link"))
                .andExpect(jsonPath("$.url").value("/p/my-renamed-link"));

        // 3. New URL returns the paste
        mockMvc.perform(get("/api/v1/pastes/my-renamed-link"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("hello world content"));

        // 4. Old URL now returns 404
        mockMvc.perform(get("/api/v1/pastes/" + originalId))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateSlug_invalidCapability_returnsForbidden() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Initial Title",
                "hello world content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        String createJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String originalId = objectMapper.readTree(createJson).get("id").asText();

        var updateRequest = new com.pastebin.paste.api.dto.UpdateSlugRequest("hack-link", "wrong-token-abc");
        mockMvc.perform(patch("/api/v1/pastes/" + originalId + "/slug")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isForbidden());
    }

    @Test
    void updateSlug_unlistedPaste_preservesShareTokenRequirement() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Unlisted Title",
                "secret unlisted content",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        String createJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String originalId = objectMapper.readTree(createJson).get("id").asText();
        String capability = objectMapper.readTree(createJson).get("deletionCapability").asText();
        String shareToken = objectMapper.readTree(createJson).get("shareToken").asText();

        // Rename unlisted paste
        var updateRequest = new com.pastebin.paste.api.dto.UpdateSlugRequest("renamed-unlisted", capability);
        mockMvc.perform(patch("/api/v1/pastes/" + originalId + "/slug")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk());

        // Without token -> 404 (oracle-free)
        mockMvc.perform(get("/api/v1/pastes/renamed-unlisted"))
                .andExpect(status().isNotFound());

        // With token -> 200 OK
        mockMvc.perform(get("/api/v1/pastes/renamed-unlisted")
                        .header("X-Share-Token", shareToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("secret unlisted content"));
    }

    @Test
    void updateSlug_viewOncePaste_preservesSingleUseWithoutPreemptiveBurn() throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "View Once Title",
                "burn content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE
        );

        String createJson = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        String originalId = objectMapper.readTree(createJson).get("id").asText();
        String capability = objectMapper.readTree(createJson).get("deletionCapability").asText();

        // Renaming must NOT consume or burn the paste!
        var updateRequest = new com.pastebin.paste.api.dto.UpdateSlugRequest("renamed-view-once", capability);
        mockMvc.perform(patch("/api/v1/pastes/" + originalId + "/slug")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk());

        // First view consumes it
        mockMvc.perform(get("/api/v1/pastes/renamed-view-once"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("burn content"));

        // Second view is burned -> 404
        mockMvc.perform(get("/api/v1/pastes/renamed-view-once"))
                .andExpect(status().isNotFound());
    }
}

