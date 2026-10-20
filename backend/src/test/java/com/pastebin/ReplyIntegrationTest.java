package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.notification.domain.Notification;
import com.pastebin.notification.infrastructure.NotificationRepository;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.CreateReplyRequest;
import com.pastebin.paste.api.dto.EditReplyRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReplyIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private ReplyRepository replyRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private com.pastebin.shared.security.RateLimiterService rateLimiterService;

    private User pasteAuthor;
    private User replyUser1;
    private User replyUser2;
    private PastebinUserPrincipal pasteAuthorPrincipal;
    private PastebinUserPrincipal user1Principal;
    private PastebinUserPrincipal user2Principal;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        notificationRepository.deleteAll();
        replyRepository.deleteAll();
        pasteRepository.deleteAll();

        pasteAuthor = userRepository.findByUsername("paste_author")
                .orElseGet(() -> userRepository.save(new User("paste_author", "author@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        replyUser1 = userRepository.findByUsername("reply_user1")
                .orElseGet(() -> userRepository.save(new User("reply_user1", "user1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        replyUser2 = userRepository.findByUsername("reply_user2")
                .orElseGet(() -> userRepository.save(new User("reply_user2", "user2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        pasteAuthorPrincipal = new PastebinUserPrincipal(pasteAuthor);
        user1Principal = new PastebinUserPrincipal(replyUser1);
        user2Principal = new PastebinUserPrincipal(replyUser2);
    }

    private String createPublicPaste(PastebinUserPrincipal creator) throws Exception {
        CreatePasteRequest createReq = new CreatePasteRequest(
                "Threaded Discussion Paste",
                "console.log('Discuss this code');",
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

    @Test
    void createTopLevelAndNestedReplyWithinDepthLimit() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        // 1. User1 creates top-level reply (depth 0)
        CreateReplyRequest topReq = new CreateReplyRequest("Top level comment by user1", null);
        MvcResult topRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(topReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.authorUsername").value("reply_user1"))
                .andExpect(jsonPath("$.depth").value(0))
                .andExpect(jsonPath("$.content").value("Top level comment by user1"))
                .andReturn();

        long topReplyId = objectMapper.readTree(topRes.getResponse().getContentAsString()).get("id").asLong();

        // 2. User2 replies to User1's reply (depth 1)
        CreateReplyRequest childReq = new CreateReplyRequest("Nested reply by user2", topReplyId);
        MvcResult childRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(childReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.parent_reply_id").value(topReplyId))
                .andExpect(jsonPath("$.depth").value(1))
                .andExpect(jsonPath("$.authorUsername").value("reply_user2"))
                .andReturn();

        long childReplyId = objectMapper.readTree(childRes.getResponse().getContentAsString()).get("id").asLong();

        // 3. User1 replies to User2's reply (depth 2 - now allowed with 5-level depth)
        CreateReplyRequest depth2Req = new CreateReplyRequest("Depth 2 reply", childReplyId);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(depth2Req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.depth").value(2));

        // 4. Verify thread structure in GET /api/v1/pastes/{pasteId}/replies
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_count").value(3))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(topReplyId))
                .andExpect(jsonPath("$.items[0].children.length()").value(1))
                .andExpect(jsonPath("$.items[0].children[0].id").value(childReplyId))
                .andExpect(jsonPath("$.items[0].children[0].content").value("Nested reply by user2"));
    }

    @Test
    void rejectsCrossPasteParentReplyId() throws Exception {
        String paste1 = createPublicPaste(pasteAuthorPrincipal);
        String paste2 = createPublicPaste(pasteAuthorPrincipal);

        // Top level reply on paste1
        CreateReplyRequest topReq = new CreateReplyRequest("Paste 1 reply", null);
        MvcResult topRes = mockMvc.perform(post("/api/v1/pastes/" + paste1 + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(topReq)))
                .andExpect(status().isCreated())
                .andReturn();

        long paste1ReplyId = objectMapper.readTree(topRes.getResponse().getContentAsString()).get("id").asLong();

        // Attempt to attach reply on paste2 to reply from paste1 -> 400
        CreateReplyRequest invalidCrossReq = new CreateReplyRequest("Cross-paste reply", paste1ReplyId);
        mockMvc.perform(post("/api/v1/pastes/" + paste2 + "/replies")
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidCrossReq)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void contentValidationAndHtmlSanitization() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        // Blank content -> 400
        CreateReplyRequest blankReq = new CreateReplyRequest("   ", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(blankReq)))
                .andExpect(status().isBadRequest());

        // HTML escaping
        CreateReplyRequest xssReq = new CreateReplyRequest("<script>alert('xss')</script><b>Hello</b>", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(xssReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.content").value("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;&lt;b&gt;Hello&lt;/b&gt;"));
    }

    @Test
    void authRequiredForWriteOperations() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        CreateReplyRequest unauthReq = new CreateReplyRequest("Unauthenticated comment", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unauthReq)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void editOwnReplyPermissions() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        CreateReplyRequest createReq = new CreateReplyRequest("Original text", null);
        MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();

        long replyId = objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();

        // Non-author tries to edit -> 403 Forbidden
        EditReplyRequest editReq = new EditReplyRequest("Hacked edit text");
        mockMvc.perform(patch("/api/v1/replies/" + replyId)
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isForbidden());

        // Author edits -> 200 OK
        EditReplyRequest authorEditReq = new EditReplyRequest("Author updated text");
        mockMvc.perform(patch("/api/v1/replies/" + replyId)
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(authorEditReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("Author updated text"));
    }

    @Test
    void softDeletePreservesThreadStructureAndShowsDeletedPlaceholder() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        // 1. Create parent reply
        CreateReplyRequest topReq = new CreateReplyRequest("Parent reply to be deleted", null);
        MvcResult topRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(topReq)))
                .andExpect(status().isCreated())
                .andReturn();

        long topId = objectMapper.readTree(topRes.getResponse().getContentAsString()).get("id").asLong();

        // 2. Create child reply
        CreateReplyRequest childReq = new CreateReplyRequest("Child reply stays intact", topId);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(childReq)))
                .andExpect(status().isCreated());

        // 3. Non-author tries to delete -> 403
        mockMvc.perform(delete("/api/v1/replies/" + topId)
                        .with(user(user2Principal))
                        .with(csrf()))
                .andExpect(status().isForbidden());

        // 4. Author soft-deletes -> 204 No Content
        mockMvc.perform(delete("/api/v1/replies/" + topId)
                        .with(user(user1Principal))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        // 5. Verify thread structure in GET: parent content is "[deleted]", child is still present
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/replies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].isDeleted").value(true))
                .andExpect(jsonPath("$.items[0].content").value("[deleted]"))
                .andExpect(jsonPath("$.items[0].authorUsername").value("[deleted]"))
                .andExpect(jsonPath("$.items[0].children[0].content").value("Child reply stays intact"));

        // 6. Attempting to edit deleted reply -> 400
        mockMvc.perform(patch("/api/v1/replies/" + topId)
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new EditReplyRequest("Cannot edit deleted"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void notificationsFireForPasteAuthorAndParentReplyAuthor() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        // User1 replies to paste -> pasteAuthor receives PASTE_REPLY notification
        CreateReplyRequest topReq = new CreateReplyRequest("Feedback on paste", null);
        MvcResult topRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(topReq)))
                .andExpect(status().isCreated())
                .andReturn();

        long topId = objectMapper.readTree(topRes.getResponse().getContentAsString()).get("id").asLong();

        List<Notification> authorNotifs = notificationRepository.findRecentForRecipientAndPaste(pasteAuthor.getId(), pasteRepository.findByPublicId(pasteId).get().getId(), java.time.Instant.EPOCH);
        assertThat(authorNotifs).hasSize(1);
        assertThat(authorNotifs.get(0).getType()).isEqualTo("PASTE_REPLY");
        assertThat(authorNotifs.get(0).getActor().getUsername()).isEqualTo("reply_user1");

        // User2 replies to User1's reply -> User1 receives THREAD_REPLY notification
        CreateReplyRequest childReq = new CreateReplyRequest("Reply to User1", topId);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(childReq)))
                .andExpect(status().isCreated());

        List<Notification> user1Notifs = notificationRepository.findRecentForRecipientAndPaste(replyUser1.getId(), pasteRepository.findByPublicId(pasteId).get().getId(), java.time.Instant.EPOCH);
        assertThat(user1Notifs).hasSize(1);
        assertThat(user1Notifs.get(0).getType()).isEqualTo("THREAD_REPLY");
        assertThat(user1Notifs.get(0).getActor().getUsername()).isEqualTo("reply_user2");

        // Self-notification check: PasteAuthor replies to their own paste -> no self-notification
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(pasteAuthorPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateReplyRequest("Author self reply", null))))
                .andExpect(status().isCreated());

        List<Notification> authorNotifsAfterSelf = notificationRepository.findRecentForRecipientAndPaste(pasteAuthor.getId(), pasteRepository.findByPublicId(pasteId).get().getId(), java.time.Instant.EPOCH);
        // Still only the 1 notification from User1
        assertThat(authorNotifsAfterSelf).hasSize(1);
    }

    @Test
    void rateLimitingEnforcedWith429WhenExceeded() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        // User1 posts 10 replies within the minute window (allowed)
        for (int i = 0; i < 10; i++) {
            CreateReplyRequest req = new CreateReplyRequest("Spam message " + i, null);
            mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                            .with(user(user1Principal))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(req)))
                    .andExpect(status().isCreated());
        }

        // 11th reply within the same minute -> 429 Too Many Requests
        CreateReplyRequest rateLimitedReq = new CreateReplyRequest("Rate limited 11th reply", null);
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(rateLimitedReq)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.status").value(429));
    }

    @Test
    void childReplyAcceptsCamelCaseParentReplyId() throws Exception {
        String pasteId = createPublicPaste(pasteAuthorPrincipal);

        // 1. Post top level reply
        MvcResult topRes = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Top reply\"}"))
                .andExpect(status().isCreated())
                .andReturn();

        long topReplyId = objectMapper.readTree(topRes.getResponse().getContentAsString()).get("id").asLong();

        // 2. Post child reply using camelCase parentReplyId as sent by frontend
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/replies")
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Child reply via camelCase\",\"parentReplyId\":" + topReplyId + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.parent_reply_id").value(topReplyId))
                .andExpect(jsonPath("$.depth").value(1))
                .andExpect(jsonPath("$.content").value("Child reply via camelCase"));
    }
}
