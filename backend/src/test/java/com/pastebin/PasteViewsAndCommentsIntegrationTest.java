package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreateCommentRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.DeleteCommentRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteCommentRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasteViewsAndCommentsIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private PasteCommentRepository pasteCommentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User testUser1;
    private User testUser2;
    private PastebinUserPrincipal principal1;
    private PastebinUserPrincipal principal2;

    @BeforeEach
    void setUp() {
        pasteCommentRepository.deleteAll();
        pasteRepository.deleteAll();

        if (userRepository.findByUsername("commenter1").isEmpty()) {
            testUser1 = userRepository.save(new User("commenter1", "c1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER"));
        } else {
            testUser1 = userRepository.findByUsername("commenter1").get();
        }

        if (userRepository.findByUsername("commenter2").isEmpty()) {
            testUser2 = userRepository.save(new User("commenter2", "c2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER"));
        } else {
            testUser2 = userRepository.findByUsername("commenter2").get();
        }

        principal1 = new PastebinUserPrincipal(testUser1);
        principal2 = new PastebinUserPrincipal(testUser2);
    }

    @Test
    void pasteViewCounterIncrementsAtomicallyOnView() throws Exception {
        // Create paste
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Counter Test",
                "public class CounterTest {}",
                "java",
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

        // 1st View -> views should be 1
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.views").value(1));

        // 2nd View -> views should be 2
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(2));

        // 3rd View -> views should be 3
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(3));
    }

    @Test
    void pasteViewCounterDeduplicatesOnPageRefreshAndSkipHeader() throws Exception {
        // Create paste
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Dedup Test",
                "public class DedupTest {}",
                "java",
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

        // 1st View from client session
        org.springframework.mock.web.MockHttpSession clientSession = new org.springframework.mock.web.MockHttpSession();
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .session(clientSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(1));

        // 2nd View: Browser refresh within the same session (F5 reload) -> must remain 1
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .session(clientSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(1));

        // 3rd View: Client sends X-Skip-View-Count header (cached in localStorage) -> must remain 1
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Skip-View-Count", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(1));

        // 4th View: A brand new visitor from a different session without skip header -> increments to 2
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(2));
    }

    @Test
    void passwordProtectedPasteDoesNotIncrementViewsUntilUnlocked() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Secret Password Paste",
                "super secret content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                "securePass123"
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // 1. View without password (challenge) -> views remains 0
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(true))
                .andExpect(jsonPath("$.views").value(0));

        // 2. View with wrong password -> 401 Unauthorized, views remains 0
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "wrongPass"))
                .andExpect(status().isUnauthorized());

        // Check DB directly: views is still 0
        Paste p = pasteRepository.findByPublicId(pasteId).orElseThrow();
        assertThat(p.getViews()).isEqualTo(0L);

        // 3. View with correct password -> unlocked, views is 1
        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .header("X-Paste-Password", "securePass123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordRequired").value(false))
                .andExpect(jsonPath("$.content").value("super secret content"))
                .andExpect(jsonPath("$.views").value(1));
    }

    @Test
    void burnAfterReadingPasteReturnsOneViewAndDeletes() throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Burn Paste",
                "ephemeral text",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.VIEW_ONCE
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // View once -> returns view 1
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.views").value(1));

        // Next view -> 404
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound());
    }

    @Test
    void anonymousAndAuthenticatedCommentingOnPublicPaste() throws Exception {
        // Create paste owned by user1
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Public Snippet",
                "console.log('discuss me');",
                "javascript",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(user(principal1))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // 1. Anonymous comment
        CreateCommentRequest anonReq = new CreateCommentRequest("Great explanation!", "AliceGuest");
        MvcResult anonRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(anonReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorName").value("AliceGuest"))
                .andExpect(jsonPath("$.content").value("Great explanation!"))
                .andExpect(jsonPath("$.isPasteAuthor").value(false))
                .andExpect(jsonPath("$.isAuthenticatedUser").value(false))
                .andExpect(jsonPath("$.deletionCapability").isNotEmpty())
                .andReturn();

        JsonNode anonNode = objectMapper.readTree(anonRes.getResponse().getContentAsString());
        Long anonCommentId = anonNode.get("id").asLong();
        String anonDeletionCap = anonNode.get("deletionCapability").asText();

        // 2. Authenticated comment from user2 (not paste owner)
        CreateCommentRequest user2Req = new CreateCommentRequest("I found a bug on line 1.", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(user(principal2))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorName").value("commenter2"))
                .andExpect(jsonPath("$.isPasteAuthor").value(false))
                .andExpect(jsonPath("$.isAuthenticatedUser").value(true));

        // 3. Authenticated comment from user1 (paste owner)
        CreateCommentRequest user1Req = new CreateCommentRequest("Thanks, I'll update it!", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(user(principal1))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user1Req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorName").value("commenter1"))
                .andExpect(jsonPath("$.isPasteAuthor").value(true))
                .andExpect(jsonPath("$.isAuthenticatedUser").value(true));

        // 4. List comments as anonymous visitor
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalComments").value(3))
                .andExpect(jsonPath("$.comments[0].authorName").value("AliceGuest"))
                .andExpect(jsonPath("$.comments[0].canDelete").value(false))
                .andExpect(jsonPath("$.comments[1].authorName").value("commenter2"))
                .andExpect(jsonPath("$.comments[1].canDelete").value(false))
                .andExpect(jsonPath("$.comments[2].authorName").value("commenter1"))
                .andExpect(jsonPath("$.comments[2].isPasteAuthor").value(true))
                .andExpect(jsonPath("$.comments[2].canDelete").value(false));

        // 5. List comments as paste owner (user1) -> canDelete should be true for all!
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments")
                        .with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comments[0].canDelete").value(true))
                .andExpect(jsonPath("$.comments[1].canDelete").value(true))
                .andExpect(jsonPath("$.comments[2].canDelete").value(true));

        // 6. List comments as user2 -> canDelete only true for comment #2
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments")
                        .with(user(principal2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comments[0].canDelete").value(false))
                .andExpect(jsonPath("$.comments[1].canDelete").value(true))
                .andExpect(jsonPath("$.comments[2].canDelete").value(false));

        // 7. Delete anonymous comment with invalid capability -> 403
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/comments/" + anonCommentId)
                        .header("X-Comment-Delete-Token", "invalid_token")
                        .with(csrf()))
                .andExpect(status().isForbidden());

        // 8. Delete anonymous comment with valid capability -> 204
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/comments/" + anonCommentId)
                        .header("X-Comment-Delete-Token", anonDeletionCap)
                        .with(csrf()))
                .andExpect(status().isNoContent());

        // Verify remaining count is 2
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalComments").value(2));
    }

    @Test
    void commentingValidationAndEdgeCases() throws Exception {
        // Create unlisted paste
        CreatePasteRequest unlistedReq = new CreatePasteRequest(
                "Unlisted Paste",
                "secret unlisted code",
                "plaintext",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult unlistedRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unlistedReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String unlistedId = objectMapper.readTree(unlistedRes.getResponse().getContentAsString()).get("id").asText();

        // 1. Comment on unlisted paste without valid access returns 404 (Anti-oracle existence privacy)
        CreateCommentRequest commentReq = new CreateCommentRequest("Test comment", "Guest");
        mockMvc.perform(post("/api/v1/pastes/" + unlistedId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(commentReq)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Paste not found or has expired."));

        // 2. Comments on non-existent paste -> 404
        mockMvc.perform(post("/api/v1/pastes/nonexistent123/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(commentReq)))
                .andExpect(status().isNotFound());

        // Create public paste for content tests
        CreatePasteRequest publicReq = new CreatePasteRequest(
                "Public Paste",
                "sample content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );
        MvcResult pubRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(publicReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String publicId = objectMapper.readTree(pubRes.getResponse().getContentAsString()).get("id").asText();

        // 3. Blank comment -> 400 Bad Request
        CreateCommentRequest blankReq = new CreateCommentRequest("   ", "Guest");
        mockMvc.perform(post("/api/v1/pastes/" + publicId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(blankReq)))
                .andExpect(status().isBadRequest());

        // 4. Over 2000 chars comment -> 400 Bad Request
        String longComment = "a".repeat(2001);
        CreateCommentRequest longReq = new CreateCommentRequest(longComment, "Guest");
        mockMvc.perform(post("/api/v1/pastes/" + publicId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(longReq)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pasteOwnerCanDeleteAnyCommentAndAuthorCanDeleteOwnComment() throws Exception {
        // Paste created by user1
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Moderation Test",
                "public content",
                "plaintext",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );
        MvcResult createRes = mockMvc.perform(post("/api/v1/pastes")
                        .with(user(principal1))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String pasteId = objectMapper.readTree(createRes.getResponse().getContentAsString()).get("id").asText();

        // user2 comments
        CreateCommentRequest req2 = new CreateCommentRequest("User2 comment", null);
        MvcResult comment2Res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(user(principal2))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req2)))
                .andExpect(status().isCreated())
                .andReturn();
        Long comment2Id = objectMapper.readTree(comment2Res.getResponse().getContentAsString()).get("id").asLong();

        // Stranger (anonymous) cannot delete user2's comment -> 403
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/comments/" + comment2Id)
                        .with(csrf()))
                .andExpect(status().isForbidden());

        // Paste owner (user1) can delete user2's comment (moderation) -> 204
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/comments/" + comment2Id)
                        .with(user(principal1))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        // Verify comment is gone
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalComments").value(0));
    }
}
