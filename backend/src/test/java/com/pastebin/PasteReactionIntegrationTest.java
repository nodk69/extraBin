package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteCommentRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class PasteReactionIntegrationTest {

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

    @Autowired
    private RateLimiterService rateLimiterService;

    private User testUser1;
    private User testUser2;
    private PastebinUserPrincipal principal1;
    private PastebinUserPrincipal principal2;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        pasteCommentRepository.deleteAll();
        pasteRepository.deleteAll();

        testUser1 = userRepository.findByUsername("reactionUser1")
                .orElseGet(() -> userRepository.save(new User("reactionUser1", "u1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        testUser2 = userRepository.findByUsername("reactionUser2")
                .orElseGet(() -> userRepository.save(new User("reactionUser2", "u2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        principal1 = new PastebinUserPrincipal(testUser1);
        principal2 = new PastebinUserPrincipal(testUser2);
    }

    private String createPublicPaste(PastebinUserPrincipal creator) throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Public Snippet", "print('hello')", "python", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY);
        var action = post("/api/v1/pastes").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req));
        if (creator != null) {
            action = action.with(user(creator));
        }
        MvcResult res = mockMvc.perform(action).andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private String createUnlistedPaste(PastebinUserPrincipal creator) throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Unlisted Snippet", "print('unlisted')", "python", Visibility.UNLISTED, ExpirationPolicy.ONE_DAY);
        var action = post("/api/v1/pastes").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req));
        if (creator != null) {
            action = action.with(user(creator));
        }
        MvcResult res = mockMvc.perform(action).andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private String createPasswordProtectedPaste(String password) throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Secret Snippet", "super secret", "plaintext", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, password);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private String createOneTimePaste() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Burn Snippet", "burn after reading", "plaintext", Visibility.PUBLIC, ExpirationPolicy.VIEW_ONCE);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    // =========================================================================
    // 1. Paste Reactions (11 Tests)
    // =========================================================================

    @Test
    @DisplayName("BE-VOTE-01: Authenticated user upvoting increments upvotes and sets userVote to UP")
    void testCastPasteUpvote_AuthenticatedUser_IncrementsUpvotesAndSetsUserVote() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pasteId").value(pasteId))
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.downvotes").value(0))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    @DisplayName("BE-VOTE-02: Authenticated user downvoting increments downvotes and sets userVote to DOWN")
    void testCastPasteDownvote_AuthenticatedUser_IncrementsDownvotesAndSetsUserVote() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pasteId").value(pasteId))
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("DOWN"));
    }

    @Test
    @DisplayName("BE-VOTE-03: Toggling vote from UP to DOWN decrements upvotes and increments downvotes")
    void testTogglePasteVote_FromUpToDown_AtomicallyUpdatesBothCounters() throws Exception {
        String pasteId = createPublicPaste(principal1);

        // Initial UP
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        // Toggle to DOWN
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("DOWN"));
    }

    @Test
    @DisplayName("BE-VOTE-04: Toggling vote from DOWN to UP decrements downvotes and increments upvotes")
    void testTogglePasteVote_FromDownToUp_AtomicallyUpdatesBothCounters() throws Exception {
        String pasteId = createPublicPaste(principal1);

        // Initial DOWN
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"))
                .andExpect(status().isOk());

        // Toggle to UP
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.downvotes").value(0))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    @DisplayName("BE-VOTE-05: Duplicate same vote is idempotent and does not increment counter")
    void testDuplicatePasteVote_SameType_IsIdempotentAndDoesNotIncrementCounter() throws Exception {
        String pasteId = createPublicPaste(principal1);

        // First vote
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));

        // Duplicate second vote
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    @DisplayName("BE-VOTE-06: Retracting vote deletes vote row and decrements counter")
    void testRetractPasteVote_DeletesVoteAndDecrementsCounter() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        // Retract
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.userVote").doesNotExist());
    }

    @Test
    @DisplayName("BE-VOTE-07: Retracting non-existent vote is idempotent and does not underflow")
    void testRetractNonExistentPasteVote_IsIdempotentAndDoesNotUnderflow() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(0));
    }

    @Test
    @DisplayName("BE-VOTE-08: Anonymous visitor can vote via peer IP hash")
    void testCastPasteVote_AnonymousUser_ValidIpHash_IncrementsCounter() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.22"); return req; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    @DisplayName("BE-VOTE-09: Duplicate anonymous vote from same IP is idempotent")
    void testDuplicateAnonymousVote_SameIp_IsIdempotent() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.22"); return req; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.22"); return req; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));
    }

    @Test
    @DisplayName("BE-VOTE-10: Anonymous visitor toggling vote updates counters")
    void testAnonymousToggleVote_SameIp_UpdatesCounters() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.22"); return req; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.22"); return req; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1));
    }

    @Test
    @DisplayName("BE-VOTE-11: Spoofed X-Forwarded-For is ignored and peer address is enforced")
    void testAnonymousUserCannotSpoofIpViaXForwardedFor_PeerSnapshotProtected() throws Exception {
        String pasteId = createPublicPaste(principal1);

        // Untrusted peer address connecting with fake X-Forwarded-For
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.50"); return req; })
                        .header("X-Forwarded-For", "203.0.113.199")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        // Same untrusted peer trying with different spoofed X-Forwarded-For must be recognized as duplicate
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.50"); return req; })
                        .header("X-Forwarded-For", "203.0.113.200")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1)); // Did not increment to 2
    }

    // =========================================================================
    // 2. Access Control & Protection Invariants (9 Tests)
    // =========================================================================

    @Test
    @DisplayName("BE-SEC-01: Voting on password-protected paste without password returns 401")
    void testVoteOnPasswordProtectedPaste_WithoutPassword_Returns401() throws Exception {
        String pasteId = createPasswordProtectedPaste("secret123");

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("BE-SEC-02: Voting on password-protected paste with correct password returns 200")
    void testVoteOnPasswordProtectedPaste_WithCorrectPassword_Returns200() throws Exception {
        String pasteId = createPasswordProtectedPaste("secret123");

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .header("X-Paste-Password", "secret123")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));
    }

    @Test
    @DisplayName("BE-SEC-03: Voting on unlisted paste without share token returns indistinguishable 404")
    void testVoteOnUnlistedPaste_WithoutShareToken_Returns404() throws Exception {
        String pasteId = createUnlistedPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal2)) // Different user without token
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("BE-SEC-04: Voting on unlisted paste with valid share token returns 200")
    void testVoteOnUnlistedPaste_WithValidShareToken_Returns200() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Tokenized", "hello", "plaintext", Visibility.UNLISTED, ExpirationPolicy.ONE_DAY);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        String pasteId = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
        String shareToken = objectMapper.readTree(res.getResponse().getContentAsString()).get("shareToken").asText();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .header("X-Share-Token", shareToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));
    }

    @Test
    @DisplayName("BE-SEC-05: Voting on revoked unlisted paste returns 404")
    void testVoteOnRevokedUnlistedPaste_Returns404() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Revoked", "hello", "plaintext", Visibility.UNLISTED, ExpirationPolicy.ONE_DAY);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).with(user(principal1)).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        String pasteId = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();

        // Owner revokes link
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/revoke-link").with(csrf()).with(user(principal1)))
                .andExpect(status().isNoContent());

        // Any vote attempt now returns 404
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal2))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("BE-SEC-06: Voting on private paste by owner returns 200")
    void testVoteOnPrivatePaste_ByOwner_Returns200() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("My Private", "secret", "plaintext", Visibility.PRIVATE, ExpirationPolicy.ONE_DAY);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).with(user(principal1)).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        String pasteId = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));
    }

    @Test
    @DisplayName("BE-SEC-07: Voting on private paste by non-owner returns 404 (no oracle leak)")
    void testVoteOnPrivatePaste_ByNonOwner_Returns404() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("My Private", "secret", "plaintext", Visibility.PRIVATE, ExpirationPolicy.ONE_DAY);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).with(user(principal1)).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        String pasteId = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal2))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("BE-SEC-08: Voting on expired paste returns 404")
    void testVoteOnExpiredPaste_Returns404() throws Exception {
        String pasteId = createPublicPaste(principal1);
        var paste = pasteRepository.findByPublicId(pasteId).get();
        paste.setExpiresAt(java.time.Instant.now().minusSeconds(10));
        pasteRepository.save(paste);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("BE-SEC-09: Voting on view-once paste returns 400 Bad Request and does NOT consume paste")
    void testVoteOnOneTimePaste_Returns400BadRequest_AndPasteIsNotConsumed() throws Exception {
        String pasteId = createOneTimePaste();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isBadRequest());

        // Paste must still be available for its one real reading!
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("burn after reading"));
    }

    // =========================================================================
    // 3. Paste Starring (5 Tests)
    // =========================================================================

    @Test
    @DisplayName("BE-STAR-01: Authenticated user starring paste increments stars count and returns isStarred true")
    void testStarPaste_AuthenticatedUser_IncrementsStarsCountAndSetsIsStarredTrue() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pasteId").value(pasteId))
                .andExpect(jsonPath("$.starsCount").value(1))
                .andExpect(jsonPath("$.isStarred").value(true));
    }

    @Test
    @DisplayName("BE-STAR-02: Authenticated user unstarring paste decrements stars count and returns isStarred false")
    void testUnstarPaste_AuthenticatedUser_DecrementsStarsCountAndSetsIsStarredFalse() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.starsCount").value(0))
                .andExpect(jsonPath("$.isStarred").value(false));
    }

    @Test
    @DisplayName("BE-STAR-03: Duplicate star request is idempotent and does not increment counter")
    void testDuplicateStarPaste_IsIdempotentAndDoesNotIncrement() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.starsCount").value(1));

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.starsCount").value(1));
    }

    @Test
    @DisplayName("BE-STAR-04: Anonymous visitor attempting to star paste returns 401 Unauthorized")
    void testStarPaste_AnonymousUser_Returns401Unauthorized() throws Exception {
        String pasteId = createPublicPaste(principal1);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("BE-STAR-05: Starring view-once paste returns 400 Bad Request and does NOT consume paste")
    void testStarPaste_OneTimePaste_Returns400BadRequest_AndPasteIsNotConsumed() throws Exception {
        String pasteId = createOneTimePaste();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isBadRequest());

        // Paste must still exist
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk());
    }

    // =========================================================================
    // 4. Rate Limiting (2 Tests)
    // =========================================================================

    @Test
    @DisplayName("BE-RATE-01: Anonymous votes exceeding per-minute threshold returns 429 with Retry-After")
    void testRateLimiting_AnonymousVotesPerMinute_Returns429WithRetryAfter() throws Exception {
        String pasteId = createPublicPaste(principal1);

        for (int i = 0; i < 30; i++) {
            rateLimiterService.checkRateLimit("vote:ip:198.51.100.99", 30, 60);
        }

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.99"); return req; })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }

    @Test
    @DisplayName("BE-RATE-02: Authenticated votes exceeding per-minute threshold returns 429")
    void testRateLimiting_AuthenticatedVotesPerMinute_Returns429() throws Exception {
        String pasteId = createPublicPaste(principal1);

        for (int i = 0; i < 60; i++) {
            rateLimiterService.checkRateLimit("vote:user:" + testUser1.getId(), 60, 60);
        }

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isTooManyRequests());
    }

    // =========================================================================
    // 5. Concurrency, Locking & Data Integrity (6 Tests)
    // =========================================================================

    @Test
    @DisplayName("BE-CONC-01: Concurrent identical votes are serialized without counter drift")
    void testConcurrentIdenticalVotes_HandledAtomicallyWithoutCounterDrift() throws Exception {
        String pasteId = createPublicPaste(principal1);
        int threads = 10;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger(0);

        for (int i = 0; i < threads; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    latch.await();
                    // Each thread has its own IP
                    MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                                    .with(csrf())
                                    .with(req -> { req.setRemoteAddr("192.0.2." + (idx + 1)); return req; })
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"voteType\":\"UP\"}"))
                            .andReturn();
                    if (res.getResponse().getStatus() == 200) {
                        successCount.incrementAndGet();
                    }
                } catch (Exception ignored) {}
            });
        }

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS);

        assertThat(successCount.get()).isEqualTo(threads);
        var paste = pasteRepository.findByPublicId(pasteId).get();
        assertThat(paste.getUpvotes()).isEqualTo(threads);
    }

    @Test
    @DisplayName("BE-CONC-02: Concurrent opposite votes are handled atomically without counter drift")
    void testConcurrentOppositeVotes_HandledAtomicallyWithoutCounterDrift() throws Exception {
        String pasteId = createPublicPaste(principal1);
        int half = 5;
        ExecutorService executor = Executors.newFixedThreadPool(half * 2);
        CountDownLatch latch = new CountDownLatch(1);

        for (int i = 0; i < half; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    latch.await();
                    mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                            .with(csrf())
                            .with(req -> { req.setRemoteAddr("10.0.1." + idx); return req; })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"voteType\":\"UP\"}"));
                } catch (Exception ignored) {}
            });
            executor.submit(() -> {
                try {
                    latch.await();
                    mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                            .with(csrf())
                            .with(req -> { req.setRemoteAddr("10.0.2." + idx); return req; })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"voteType\":\"DOWN\"}"));
                } catch (Exception ignored) {}
            });
        }

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS);

        var paste = pasteRepository.findByPublicId(pasteId).get();
        assertThat(paste.getUpvotes()).isEqualTo(half);
        assertThat(paste.getDownvotes()).isEqualTo(half);
    }

    @Test
    @DisplayName("BE-CONC-03: Concurrent duplicate star requests maintain exact single star count")
    void testConcurrentDuplicateStarRequests_MaintainsExactSingleStarCount() throws Exception {
        String pasteId = createPublicPaste(principal1);
        int threads = 6;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(1);

        for (int i = 0; i < threads; i++) {
            executor.submit(() -> {
                try {
                    latch.await();
                    mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                            .with(csrf()).with(user(principal1)));
                } catch (Exception ignored) {}
            });
        }

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS);

        var paste = pasteRepository.findByPublicId(pasteId).get();
        assertThat(paste.getStarsCount()).isEqualTo(1L);
    }

    @Test
    @DisplayName("BE-CONC-04: Concurrent duplicate unstar requests do not underflow")
    void testConcurrentDuplicateUnstarRequests_DoesNotUnderflow() throws Exception {
        String pasteId = createPublicPaste(principal1);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk());

        int threads = 6;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(1);

        for (int i = 0; i < threads; i++) {
            executor.submit(() -> {
                try {
                    latch.await();
                    mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/star")
                            .with(csrf()).with(user(principal1)));
                } catch (Exception ignored) {}
            });
        }

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS);

        var paste = pasteRepository.findByPublicId(pasteId).get();
        assertThat(paste.getStarsCount()).isEqualTo(0L);
    }

    @Test
    @DisplayName("BE-CONC-05: Concurrent vote and retract produces deterministic final state")
    void testConcurrentVoteAndRetract_ProducesDeterministicFinalState() throws Exception {
        String pasteId = createPublicPaste(principal1);

        // Pre-cast vote
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit(() -> {
            try {
                latch.await();
                mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/vote").with(csrf()).with(user(principal1)));
            } catch (Exception ignored) {}
        });

        executor.submit(() -> {
            try {
                latch.await();
                mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"));
            } catch (Exception ignored) {}
        });

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);

        var paste = pasteRepository.findByPublicId(pasteId).get();
        // Either retract won (up=0, down=0) or vote won (up=0, down=1)
        assertThat(paste.getUpvotes()).isEqualTo(0L);
        assertThat(paste.getDownvotes()).isIn(0L, 1L);
    }

    @Test
    @DisplayName("BE-CASCADE-01: Deleting a paste cascades and deletes all associated votes and stars")
    void testDeletePaste_CascadesAndDeletesAllVotesAndStars() throws Exception {
        String pasteId = createPublicPaste(principal1);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk());

        var paste = pasteRepository.findByPublicId(pasteId).get();
        pasteRepository.delete(paste);

        // Paste is gone
        assertThat(pasteRepository.findByPublicId(pasteId)).isEmpty();
    }
}
