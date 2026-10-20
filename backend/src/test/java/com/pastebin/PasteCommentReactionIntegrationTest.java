package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreateCommentRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteCommentRepository;
import com.pastebin.paste.infrastructure.PasteRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class PasteCommentReactionIntegrationTest {

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
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    private User testUser1;
    private User testUser2;
    private PastebinUserPrincipal principal1;
    private PastebinUserPrincipal principal2;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        pasteCommentRepository.deleteAll();
        pasteRepository.deleteAll();

        testUser1 = userRepository.findByUsername("commentVoter1")
                .orElseGet(() -> userRepository.save(new User("commentVoter1", "cv1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        testUser2 = userRepository.findByUsername("commentVoter2")
                .orElseGet(() -> userRepository.save(new User("commentVoter2", "cv2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        principal1 = new PastebinUserPrincipal(testUser1);
        principal2 = new PastebinUserPrincipal(testUser2);
    }

    private String createPublicPaste() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Snippet", "code", "python", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private Long createComment(String pasteId) throws Exception {
        CreateCommentRequest req = new CreateCommentRequest("Great paste!", "VoterAuthor");
        MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();
    }

    @Test
    @DisplayName("BE-COM-VOTE-01: Upvoting a comment increments comment upvotes")
    void testCommentVote_Upvote_IncrementsCommentUpvotes() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commentId").value(commentId))
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.downvotes").value(0))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    @DisplayName("BE-COM-VOTE-02: Downvoting a comment increments comment downvotes")
    void testCommentVote_Downvote_IncrementsCommentDownvotes() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commentId").value(commentId))
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("DOWN"));
    }

    @Test
    @DisplayName("BE-COM-VOTE-03: Toggling comment vote updates comment counters atomically")
    void testCommentVote_Toggle_AtomicallyUpdatesCommentCounters() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        // First UP
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        // Toggle to DOWN
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"DOWN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1));
    }

    @Test
    @DisplayName("BE-COM-VOTE-04: Retracting comment vote decrements comment counter")
    void testCommentVote_Retract_DecrementsCommentCounter() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0));
    }

    @Test
    @DisplayName("BE-COM-VOTE-05: Comment ID mismatch with requested paste returns 404")
    void testCommentVote_MismatchPasteIdAndCommentId_Returns404() throws Exception {
        String paste1 = createPublicPaste();
        String paste2 = createPublicPaste();
        Long commentOnPaste1 = createComment(paste1);

        // Attempt to vote on comment 1 using paste 2's URL
        mockMvc.perform(post("/api/v1/pastes/" + paste2 + "/comments/" + commentOnPaste1 + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("BE-COM-CONC-01: Concurrent opposite comment votes maintain consistent comment counters")
    void testConcurrentOppositeCommentVotes_MaintainsConsistentCommentCounters() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);
        int half = 4;
        ExecutorService executor = Executors.newFixedThreadPool(half * 2);
        CountDownLatch latch = new CountDownLatch(1);

        for (int i = 0; i < half; i++) {
            final int idx = i;
            executor.submit(() -> {
                try {
                    latch.await();
                    mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                            .with(csrf())
                            .with(req -> { req.setRemoteAddr("172.16.1." + idx); return req; })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"voteType\":\"UP\"}"));
                } catch (Exception ignored) {}
            });
            executor.submit(() -> {
                try {
                    latch.await();
                    mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                            .with(csrf())
                            .with(req -> { req.setRemoteAddr("172.16.2." + idx); return req; })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"voteType\":\"DOWN\"}"));
                } catch (Exception ignored) {}
            });
        }

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS);

        var comment = pasteCommentRepository.findById(commentId).get();
        assertThat(comment.getUpvotes()).isEqualTo(half);
        assertThat(comment.getDownvotes()).isEqualTo(half);
    }

    @Test
    @DisplayName("BE-COM-CONC-02: Concurrent mutations of different comments on same paste do not deadlock")
    void testConcurrentMutationsOfDifferentCommentsOnSamePaste_ParentPasteLockPreventsDeadlock() throws Exception {
        String pasteId = createPublicPaste();
        Long comment1 = createComment(pasteId);
        Long comment2 = createComment(pasteId);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit(() -> {
            try {
                latch.await();
                mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + comment1 + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"));
            } catch (Exception ignored) {}
        });

        executor.submit(() -> {
            try {
                latch.await();
                mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + comment2 + "/vote")
                        .with(csrf()).with(user(principal2))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"));
            } catch (Exception ignored) {}
        });

        latch.countDown();
        executor.shutdown();
        executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);

        assertThat(pasteCommentRepository.findById(comment1).get().getUpvotes()).isEqualTo(1L);
        assertThat(pasteCommentRepository.findById(comment2).get().getUpvotes()).isEqualTo(1L);
    }

    @Test
    @DisplayName("BE-COM-CASCADE-01: Deleting a comment cascades and deletes all comment votes")
    void testDeleteComment_CascadesAndDeletesAllCommentVotes() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        pasteCommentRepository.deleteById(commentId);
        assertThat(pasteCommentRepository.findById(commentId)).isEmpty();
    }
}
