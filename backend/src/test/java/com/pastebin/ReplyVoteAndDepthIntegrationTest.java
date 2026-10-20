package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreateReplyRequest;
import com.pastebin.paste.api.dto.VoteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.VoteType;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.infrastructure.ReplyRepository;
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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReplyVoteAndDepthIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private ReplyRepository replyRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    private User pasteAuthor;
    private User voter;
    private PastebinUserPrincipal authorPrincipal;
    private PastebinUserPrincipal voterPrincipal;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        replyRepository.deleteAll();
        pasteRepository.deleteAll();

        pasteAuthor = userRepository.findByUsername("depth_author")
                .orElseGet(() -> userRepository.save(new User("depth_author", "depth_author@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        voter = userRepository.findByUsername("depth_voter")
                .orElseGet(() -> userRepository.save(new User("depth_voter", "depth_voter@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        authorPrincipal = new PastebinUserPrincipal(pasteAuthor);
        voterPrincipal = new PastebinUserPrincipal(voter);
    }

    private String createPublicPaste(PastebinUserPrincipal creator) throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Depth and Vote Test Paste",
                "console.log('test');",
                "javascript",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult result = mockMvc.perform(post("/api/v1/pastes")
                        .with(user(creator))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private long createReply(String pasteId, PastebinUserPrincipal principal, String content, Long parentReplyId) throws Exception {
        CreateReplyRequest req = new CreateReplyRequest(content, parentReplyId);
        MvcResult result = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asLong();
    }

    private long createReplyLenient(String pasteId, PastebinUserPrincipal principal, String content, Long parentReplyId) throws Exception {
        CreateReplyRequest req = new CreateReplyRequest(content, parentReplyId);
        MvcResult result = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andReturn();

        if (result.getResponse().getStatus() != 201) {
            throw new AssertionError("createReplyLenient failed with status " + result.getResponse().getStatus() + ": " + result.getResponse().getContentAsString());
        }
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asLong();
    }

    // =========================================================================
    // DEPTH TESTS (RV-D1 through RV-D7)
    // =========================================================================

    @Test
    void RV_D1_createTopLevelReply_returns201WithDepth0() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);

        CreateReplyRequest req = new CreateReplyRequest("Top level reply", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(voterPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(0))
                .andExpect(jsonPath("$.content").value("Top level reply"));
    }

    @Test
    void RV_D2_createDepth1Reply_returns201WithDepth1() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long rootId = createReply(pasteId, voterPrincipal, "Root reply", null);

        CreateReplyRequest req = new CreateReplyRequest("Depth 1 reply", rootId);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(1))
                .andExpect(jsonPath("$.parent_reply_id").value(rootId));
    }

    @Test
    void RV_D3_createDepth2Reply_returns201WithDepth2() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long rootId = createReply(pasteId, voterPrincipal, "Root reply", null);
        long depth1Id = createReply(pasteId, authorPrincipal, "Depth 1 reply", rootId);

        CreateReplyRequest req = new CreateReplyRequest("Depth 2 reply", depth1Id);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(voterPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(2));
    }

    @Test
    void RV_D4_createDepth3Reply_returns201WithDepth3() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long rootId = createReply(pasteId, voterPrincipal, "Root", null);
        long d1 = createReply(pasteId, authorPrincipal, "D1", rootId);
        long d2 = createReply(pasteId, voterPrincipal, "D2", d1);

        CreateReplyRequest req = new CreateReplyRequest("Depth 3 reply", d2);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(3));
    }

    @Test
    void RV_D5_createDepth4Reply_returns201WithDepth4() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long rootId = createReply(pasteId, voterPrincipal, "Root", null);
        long d1 = createReply(pasteId, authorPrincipal, "D1", rootId);
        long d2 = createReply(pasteId, voterPrincipal, "D2", d1);
        long d3 = createReply(pasteId, authorPrincipal, "D3", d2);

        CreateReplyRequest req = new CreateReplyRequest("Depth 4 reply", d3);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(voterPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(4));
    }

    @Test
    void RV_D6_createDepth5Reply_returns400ExceedsMax() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long rootId = createReply(pasteId, voterPrincipal, "Root", null);
        long d1 = createReply(pasteId, authorPrincipal, "D1", rootId);
        long d2 = createReply(pasteId, voterPrincipal, "D2", d1);
        long d3 = createReply(pasteId, authorPrincipal, "D3", d2);
        long d4 = createReply(pasteId, voterPrincipal, "D4", d3);

        CreateReplyRequest req = new CreateReplyRequest("Depth 5 reply - should fail", d4);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void RV_D7_getReplies_returnsAllFiveLevelsNested() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long rootId = createReply(pasteId, voterPrincipal, "Root", null);
        long d1 = createReply(pasteId, authorPrincipal, "D1", rootId);
        long d2 = createReply(pasteId, voterPrincipal, "D2", d1);
        long d3 = createReply(pasteId, authorPrincipal, "D3", d2);
        createReply(pasteId, voterPrincipal, "D4", d3);

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items[0].children").isArray())
                .andExpect(jsonPath("$.items[0].children[0].children").isArray())
                .andExpect(jsonPath("$.items[0].children[0].children[0].children").isArray())
                .andExpect(jsonPath("$.items[0].children[0].children[0].children[0].children").isArray())
                .andExpect(jsonPath("$.items[0].children[0].children[0].children[0].children[0].content").value("D4"));
    }

    // =========================================================================
    // VOTING TESTS (RV-V1 through RV-V11)
    // =========================================================================

    @Test
    void RV_V1_authenticatedUser_upvotes_reply_returns200WithCounts() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Vote me", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replyId").value(replyId))
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.downvotes").value(0))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    void RV_V2_authenticatedUser_downvotes_reply_returns200WithCounts() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Vote me", null);

        VoteRequest voteReq = new VoteRequest(VoteType.DOWN);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replyId").value(replyId))
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("DOWN"));
    }

    @Test
    void RV_V3_switchVoteFromUp_toDown() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Switch vote", null);

        VoteRequest upReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(upReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.downvotes").value(0));

        VoteRequest downReq = new VoteRequest(VoteType.DOWN);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(downReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("DOWN"));
    }

    @Test
    void RV_V4_retractVote_returns200WithNullUserVote() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Retract me", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.downvotes").value(0))
                .andExpect(jsonPath("$.userVote").isEmpty());
    }

    @Test
    void RV_V5_anonymousUser_upvotes_byIpHash_returns200() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Anonymous vote", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    void RV_V6_anonymousUser_retractsVote_byIpHash() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Anonymous retract", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(0))
                .andExpect(jsonPath("$.userVote").isEmpty());
    }

    @Test
    void RV_V7_idempotentReVote_sameType_noDoubleCounting() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Idempotent vote", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1));

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.upvotes").value(1))
                .andExpect(jsonPath("$.userVote").value("UP"));
    }

    @Test
    void RV_V8_voteOnNonexistentReply_returns404() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/999999/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isNotFound());
    }

    @Test
    void RV_V9_voteWithWrongPasteId_returns404() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Wrong paste", null);

        String otherPasteId = createPublicPaste(voterPrincipal);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + otherPasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isNotFound());
    }

    @Test
    void RV_V10_getReplies_includesVoteCountsAndUserVote() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Vote counts in GET", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                        .with(user(authorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(voteReq)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(authorPrincipal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].upvotes").value(1))
                .andExpect(jsonPath("$.items[0].downvotes").value(0))
                .andExpect(jsonPath("$.items[0].userVote").value("UP"));
    }

    @Test
    void RV_V11_rateLimit_exceeded_returns429() throws Exception {
        String pasteId = createPublicPaste(authorPrincipal);
        long replyId = createReply(pasteId, voterPrincipal, "Rate limit test", null);

        VoteRequest voteReq = new VoteRequest(VoteType.UP);
        for (int i = 0; i < 65; i++) {
            var result = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies/" + replyId + "/vote")
                            .with(user(authorPrincipal))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(voteReq)))
                    .andReturn();

            if (result.getResponse().getStatus() == 429) {
                return;
            }
        }

        throw new AssertionError("Expected 429 rate limit response after repeated votes");
    }
}
