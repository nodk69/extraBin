package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.shared.security.RateLimiterService;
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
public class RecentActivityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private RateLimiterService rateLimiterService;

    @Autowired
    private com.pastebin.paste.infrastructure.PasteRepository pasteRepository;

    @Autowired
    private com.pastebin.paste.infrastructure.TagRepository tagRepository;

    @Autowired
    private com.pastebin.paste.infrastructure.PasteViewHistoryRepository pasteViewHistoryRepository;

    private PastebinUserPrincipal user1Principal;
    private PastebinUserPrincipal user2Principal;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        pasteRepository.deleteAll();
        tagRepository.deleteAll();
        pasteViewHistoryRepository.deleteAll();

        User user1 = userRepository.findByUsername("recent_user1")
                .orElseGet(() -> userRepository.save(new User("recent_user1", "recent1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));
        User user2 = userRepository.findByUsername("recent_user2")
                .orElseGet(() -> userRepository.save(new User("recent_user2", "recent2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        user1Principal = new PastebinUserPrincipal(user1);
        user2Principal = new PastebinUserPrincipal(user2);
    }

    private String createPaste(PastebinUserPrincipal principal) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Test Paste",
                "System.out.println(\"test\");",
                "java",
                com.pastebin.paste.domain.Visibility.PRIVATE,
                com.pastebin.paste.domain.ExpirationPolicy.ONE_DAY
        );

        MvcResult result = mockMvc.perform(post("/api/v1/pastes")
                        .with(user(principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    // =========================================================================
    // RECENT-VIEW-1: Viewing paste adds to recently viewed
    // =========================================================================
    @Test
    void viewingPasteAddsToRecentlyViewed() throws Exception {
        String pasteId = createPaste(user1Principal);

        mockMvc.perform(get("/api/v1/pastes/" + pasteId)
                        .with(user(user1Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(pasteId));
    }

    // =========================================================================
    // RECENT-VIEW-2: Multiple views update recency
    // =========================================================================
    @Test
    void multipleViewsUpdateRecency() throws Exception {
        String paste1 = createPaste(user1Principal);
        String paste2 = createPaste(user1Principal);
        String paste3 = createPaste(user1Principal);

        mockMvc.perform(get("/api/v1/pastes/" + paste1).with(user(user1Principal)))
                .andExpect(status().isOk());
        Thread.sleep(10);

        mockMvc.perform(get("/api/v1/pastes/" + paste2).with(user(user1Principal)))
                .andExpect(status().isOk());
        Thread.sleep(10);

        mockMvc.perform(get("/api/v1/pastes/" + paste3).with(user(user1Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].id").value(paste3))
                .andExpect(jsonPath("$[1].id").value(paste2))
                .andExpect(jsonPath("$[2].id").value(paste1));
    }

    // =========================================================================
    // RECENT-VIEW-3: Revisiting paste moves it to top
    // =========================================================================
    @Test
    void revisitingPasteMovesToTop() throws Exception {
        String paste1 = createPaste(user1Principal);
        String paste2 = createPaste(user1Principal);

        mockMvc.perform(get("/api/v1/pastes/" + paste1).with(user(user1Principal)))
                .andExpect(status().isOk());
        Thread.sleep(10);

        mockMvc.perform(get("/api/v1/pastes/" + paste2).with(user(user1Principal)))
                .andExpect(status().isOk());
        Thread.sleep(10);

        mockMvc.perform(get("/api/v1/pastes/" + paste1).with(user(user1Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(paste1))
                .andExpect(jsonPath("$[1].id").value(paste2));
    }

    // =========================================================================
    // RECENT-VIEW-4: Recently viewed is bounded (max 50)
    // =========================================================================
    @Test
    void recentlyViewedIsBounded() throws Exception {
        for (int i = 0; i < 60; i++) {
            String pasteId = createPaste(user1Principal);
            mockMvc.perform(get("/api/v1/pastes/" + pasteId).with(user(user1Principal)))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(50));
    }

    // =========================================================================
    // RECENT-VIEW-5: User isolation - User A cannot see User B's history
    // =========================================================================
    @Test
    void userIsolationRecentlyViewed() throws Exception {
        String paste1 = createPaste(user1Principal);
        String paste2 = createPaste(user2Principal);

        mockMvc.perform(get("/api/v1/pastes/" + paste1).with(user(user1Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/" + paste2).with(user(user2Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(paste1));

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user2Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(paste2));
    }

    // =========================================================================
    // RECENT-VIEW-6: Anonymous access denied
    // =========================================================================
    @Test
    void anonymousAccessDeniedRecentlyViewed() throws Exception {
        mockMvc.perform(get("/api/v1/account/recently-viewed"))
                .andExpect(status().isUnauthorized());
    }

    // =========================================================================
    // RECENT-EDIT-1: Editing paste updates recently edited
    // =========================================================================
    @Test
    void editingPasteUpdatesRecentlyEdited() throws Exception {
        String pasteId = createPaste(user1Principal);

        String updateContent = "{\"title\": \"Updated Title\", \"content\": \"Updated content\", \"language\": \"java\", \"visibility\": \"PRIVATE\", \"version\": 0}";

        mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateContent))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-edited")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(pasteId));
    }

    // =========================================================================
    // RECENT-EDIT-2: Recently edited sorted by updatedAt
    // =========================================================================
    @Test
    void recentlyEditedSortedByUpdatedAt() throws Exception {
        String paste1 = createPaste(user1Principal);
        Thread.sleep(10);
        String paste2 = createPaste(user1Principal);
        Thread.sleep(10);
        String paste3 = createPaste(user1Principal);

        String updateContent = "{\"title\": \"Updated\", \"content\": \"Updated\", \"language\": \"java\", \"visibility\": \"PRIVATE\", \"version\": 0}";

        mockMvc.perform(put("/api/v1/account/pastes/" + paste1)
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateContent))
                .andExpect(status().isOk());
        Thread.sleep(10);

        mockMvc.perform(put("/api/v1/account/pastes/" + paste3)
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateContent))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-edited")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(paste3))
                .andExpect(jsonPath("$[1].id").value(paste1));
    }

    // =========================================================================
    // RECENT-EDIT-3: Viewing does not count as editing
    // =========================================================================
    @Test
    void viewingDoesNotCountAsEditing() throws Exception {
        String pasteId = createPaste(user1Principal);

        mockMvc.perform(get("/api/v1/pastes/" + pasteId).with(user(user1Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-edited")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // =========================================================================
    // RECENT-EDIT-4: Recently edited is bounded (max 50)
    // =========================================================================
    @Test
    void recentlyEditedIsBounded() throws Exception {
        String updateContent = "{\"title\": \"Updated\", \"content\": \"Updated\", \"language\": \"java\", \"visibility\": \"PRIVATE\", \"version\": 0}";

        for (int i = 0; i < 60; i++) {
            String pasteId = createPaste(user1Principal);
            mockMvc.perform(put("/api/v1/account/pastes/" + pasteId)
                            .with(user(user1Principal))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(updateContent))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/v1/account/recently-edited")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(50));
    }

    // =========================================================================
    // RECENT-EDIT-5: User isolation for recently edited
    // =========================================================================
    @Test
    void userIsolationRecentlyEdited() throws Exception {
        String paste1 = createPaste(user1Principal);
        String paste2 = createPaste(user2Principal);

        String updateContent = "{\"title\": \"Updated\", \"content\": \"Updated\", \"language\": \"java\", \"visibility\": \"PRIVATE\", \"version\": 0}";

        mockMvc.perform(put("/api/v1/account/pastes/" + paste1)
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateContent))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/v1/account/pastes/" + paste2)
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateContent))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/account/recently-edited")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(paste1));

        mockMvc.perform(get("/api/v1/account/recently-edited")
                        .with(user(user2Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(paste2));
    }

    // =========================================================================
    // RECENT-VIEW-7: Deleted paste removed from recently viewed
    // =========================================================================
    @Test
    void deletedPasteRemovedFromRecentlyViewed() throws Exception {
        String pasteId = createPaste(user1Principal);

        mockMvc.perform(get("/api/v1/pastes/" + pasteId).with(user(user1Principal)))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/account/pastes/" + pasteId)
                        .with(user(user1Principal))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/account/recently-viewed")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
