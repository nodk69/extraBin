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
public class TagIntegrationTest {

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

    private PastebinUserPrincipal user1Principal;
    private PastebinUserPrincipal user2Principal;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        pasteRepository.deleteAll();
        tagRepository.deleteAll();

        User user1 = userRepository.findByUsername("tag_user1")
                .orElseGet(() -> userRepository.save(new User("tag_user1", "tag1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));
        User user2 = userRepository.findByUsername("tag_user2")
                .orElseGet(() -> userRepository.save(new User("tag_user2", "tag2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        user1Principal = new PastebinUserPrincipal(user1);
        user2Principal = new PastebinUserPrincipal(user2);
    }

    private String createPublicPaste(PastebinUserPrincipal principal) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                "Test Paste",
                "System.out.println(\"Hello\");",
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
    // TAG-1: Create tag on paste
    // =========================================================================
    @Test
    void createTagOnPaste() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"java\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("java"));
    }

    // =========================================================================
    // TAG-2: Create multiple tags on paste
    // =========================================================================
    @Test
    void createMultipleTagsOnPaste() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"backend\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"spring\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    // =========================================================================
    // TAG-3: Cannot create duplicate tag on same paste
    // =========================================================================
    @Test
    void cannotCreateDuplicateTagOnSamePaste() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"java\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"java\"}"))
                .andExpect(status().isConflict());
    }

    // =========================================================================
    // TAG-4: Remove tag from paste
    // =========================================================================
    @Test
    void removeTagFromPaste() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        MvcResult tagResult = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"test\"}"))
                .andExpect(status().isCreated())
                .andReturn();

        long tagId = objectMapper.readTree(tagResult.getResponse().getContentAsString()).get("id").asLong();

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/tags/" + tagId)
                        .with(user(user1Principal))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // =========================================================================
    // TAG-5: User A cannot tag User B's paste
    // =========================================================================
    @Test
    void userACannotTagUserBPaste() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user2Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"unauthorized\"}"))
                .andExpect(status().isForbidden());
    }

    // =========================================================================
    // TAG-6: Filter pastes by tag
    // =========================================================================
    @Test
    void filterPastesByTag() throws Exception {
        String paste1 = createPublicPaste(user1Principal);
        String paste2 = createPublicPaste(user1Principal);
        String paste3 = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + paste1 + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"java\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/pastes/" + paste2 + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"java\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/pastes/" + paste3 + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"python\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("tag", "java"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    // =========================================================================
    // TAG-7: Tag name normalization (lowercase, trimmed)
    // =========================================================================
    @Test
    void tagNameNormalization() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        MvcResult result = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"  Java  \"}"))
                .andExpect(status().isCreated())
                .andReturn();

        String tagName = objectMapper.readTree(result.getResponse().getContentAsString()).get("name").asText();
        assert tagName.equals("java");
    }

    // =========================================================================
    // TAG-8: Tag name validation (max length)
    // =========================================================================
    @Test
    void tagNameMaxLength() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        String longTagName = "a".repeat(51);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"" + longTagName + "\"}"))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // TAG-9: Max tags per paste
    // =========================================================================
    @Test
    void maxTagsPerPaste() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                            .with(user(user1Principal))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\": \"tag" + i + "\"}"))
                    .andExpect(status().isCreated());
        }

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"tag10\"}"))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // TAG-10: Get all user tags
    // =========================================================================
    @Test
    void getAllUserTags() throws Exception {
        String paste1 = createPublicPaste(user1Principal);
        String paste2 = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + paste1 + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"java\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/pastes/" + paste1 + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"spring\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/pastes/" + paste2 + "/tags")
                        .with(user(user1Principal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"python\"}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/account/tags")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    // =========================================================================
    // TAG-11: Anonymous callers are rejected with 403 (never 500, never data)
    // =========================================================================
    @Test
    void anonymousTagAccessIsRejected() throws Exception {
        String pasteId = createPublicPaste(user1Principal);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/tags")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"anon\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/tags"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/tags/1")
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }
}
