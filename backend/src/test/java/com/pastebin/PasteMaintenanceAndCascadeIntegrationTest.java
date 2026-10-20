package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreateCommentRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.application.PasteReactionService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class PasteMaintenanceAndCascadeIntegrationTest {

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

    @Autowired(required = false)
    private PasteReactionService pasteReactionService;

    private User testUser1;
    private User testUser2;
    private PastebinUserPrincipal principal1;
    private PastebinUserPrincipal principal2;

    @BeforeEach
    void setUp() {
        pasteCommentRepository.deleteAll();
        pasteRepository.deleteAll();

        testUser1 = userRepository.findByUsername("maintUser1")
                .orElseGet(() -> userRepository.save(new User("maintUser1", "m1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        testUser2 = userRepository.findByUsername("maintUser2")
                .orElseGet(() -> userRepository.save(new User("maintUser2", "m2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        principal1 = new PastebinUserPrincipal(testUser1);
        principal2 = new PastebinUserPrincipal(testUser2);
    }

    private String createPublicPaste() throws Exception {
        CreatePasteRequest req = new CreatePasteRequest("Maint Snippet", "print('maint')", "python", Visibility.PUBLIC, ExpirationPolicy.ONE_DAY);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes").with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private Long createComment(String pasteId) throws Exception {
        CreateCommentRequest req = new CreateCommentRequest("Nice maintenance!", "MaintAuthor");
        MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();
    }

    @Test
    @DisplayName("BE-MAINT-01: User deletion maintenance transactionally decrements paste upvote, downvote, and star counters")
    void testUserDeletion_TransactionalMaintenanceDecrementsAllPasteAndCommentCounters() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        // User 2 votes and stars paste, and votes on comment
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote").with(csrf()).with(user(principal2))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star").with(csrf()).with(user(principal2)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments/" + commentId + "/vote").with(csrf()).with(user(principal2))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        assertThat(pasteRepository.findByPublicId(pasteId).get().getUpvotes()).isEqualTo(1L);
        assertThat(pasteRepository.findByPublicId(pasteId).get().getStarsCount()).isEqualTo(1L);
        assertThat(pasteCommentRepository.findById(commentId).get().getUpvotes()).isEqualTo(1L);

        // Perform user deletion maintenance
        assertThat(pasteReactionService).isNotNull();
        pasteReactionService.deleteUserMaintenance(testUser2.getId());

        // Assert all counters are cleanly decremented
        assertThat(pasteRepository.findByPublicId(pasteId).get().getUpvotes()).isEqualTo(0L);
        assertThat(pasteRepository.findByPublicId(pasteId).get().getStarsCount()).isEqualTo(0L);
        assertThat(pasteCommentRepository.findById(commentId).get().getUpvotes()).isEqualTo(0L);
    }

    @Test
    @DisplayName("BE-MAINT-02: reconcileAllCounters repairs deliberately drifted paste and comment counters")
    void testReconcileAllCounters_RepairsDeliberatelyDriftedPasteAndCommentCounters() throws Exception {
        String pasteId = createPublicPaste();
        Long commentId = createComment(pasteId);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote").with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        // Deliberately introduce drift in DB
        var paste = pasteRepository.findByPublicId(pasteId).get();
        paste.setUpvotes(99L);
        paste.setStarsCount(50L);
        pasteRepository.save(paste);

        var comment = pasteCommentRepository.findById(commentId).get();
        comment.setUpvotes(42L);
        pasteCommentRepository.save(comment);

        assertThat(pasteReactionService).isNotNull();
        pasteReactionService.reconcileAllCounters();

        // Check restored to true count (1 upvote, 0 stars, 0 comment upvotes)
        assertThat(pasteRepository.findByPublicId(pasteId).get().getUpvotes()).isEqualTo(1L);
        assertThat(pasteRepository.findByPublicId(pasteId).get().getStarsCount()).isEqualTo(0L);
        assertThat(pasteCommentRepository.findById(commentId).get().getUpvotes()).isEqualTo(0L);
    }

    @Test
    @DisplayName("BE-MAINT-03: purgeAnonymousVotes deletes anonymous rows and restores aggregate counts to authenticated totals")
    void testPurgeAnonymousVotes_DeletesAnonRowsAndReconcilesCountersToAuthenticatedTotals() throws Exception {
        String pasteId = createPublicPaste();

        // 1 authenticated vote
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote").with(csrf()).with(user(principal1))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        // 1 anonymous vote
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/vote").with(csrf())
                        .with(req -> { req.setRemoteAddr("198.51.100.77"); return req; })
                        .contentType(MediaType.APPLICATION_JSON).content("{\"voteType\":\"UP\"}"))
                .andExpect(status().isOk());

        assertThat(pasteRepository.findByPublicId(pasteId).get().getUpvotes()).isEqualTo(2L);

        assertThat(pasteReactionService).isNotNull();
        pasteReactionService.purgeAnonymousVotesAndReconcile();

        // Restored to authenticated only (1)
        assertThat(pasteRepository.findByPublicId(pasteId).get().getUpvotes()).isEqualTo(1L);
    }
}
