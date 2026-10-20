package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.paste.api.dto.CreateCommentRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
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

/**
 * Phase 2 security reproductions for the paste-comments surface.
 *
 * Tests in this class are written to the DESIRED security contract. They are expected to
 * FAIL before the corresponding fix and PASS afterwards (see
 * docs/security-audit/SECURITY_FINDINGS_AND_REPRODUCTIONS.md, P2-01, P2-03, P2-05, P2-09).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class Phase2CommentsSecurityRegressionTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RateLimiterService rateLimiterService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User owner;
    private PastebinUserPrincipal ownerPrincipal;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();

        if (userRepository.findByUsername("commentsecowner").isEmpty()) {
            owner = userRepository.save(new User("commentsecowner", "csowner@pastebin.local",
                    passwordEncoder.encode("Pass123!"), "ROLE_USER"));
        } else {
            owner = userRepository.findByUsername("commentsecowner").get();
        }
        ownerPrincipal = new PastebinUserPrincipal(owner);
    }

    private String createPaste(Visibility visibility, ExpirationPolicy policy, String password) throws Exception {
        CreatePasteRequest req = new CreatePasteRequest(
                "Phase2 Security Paste",
                "console.log('secret-ish');",
                "javascript",
                visibility,
                policy,
                password
        );

        MvcResult res = mockMvc.perform(post("/api/v1/pastes")
                        .with(user(ownerPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private String createPublicPasswordPaste() throws Exception {
        return createPaste(Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, "passcode123");
    }

    /**
     * P2-09 (read bypass): an anonymous caller who does NOT know the paste password must not be able
     * to read the discussion of a password-protected paste. Desired: the uniform 404 used for
     * unavailable pastes, never 200.
     */
    @Test
    void commentsOnPasswordProtectedPasteRequireThePasswordOnRead() throws Exception {
        String pasteId = createPublicPasswordPaste();

        // Seed one authenticated comment (by the owner, who — per the F-2 contract — must supply the
        // paste password like every other caller of a locked paste).
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .header("X-Paste-Password", "passcode123")
                        .with(user(ownerPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateCommentRequest("Owner note", null))))
                .andExpect(status().isCreated());

        // Anonymous read without password must NOT succeed.
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isNotFound());
    }

    /**
     * P2-09 (write bypass): an anonymous caller without the paste password must not be able to post
     * comments on a password-protected paste. Desired: uniform 404, and the comment must not be
     * persisted.
     */
    @Test
    void commentsOnPasswordProtectedPasteRequireThePasswordOnWrite() throws Exception {
        String pasteId = createPublicPasswordPaste();

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateCommentRequest("Guest Drive-By", "Anon"))))
                .andExpect(status().isNotFound());

        // With the correct password the comment must be accepted.
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .header("X-Paste-Password", "passcode123")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateCommentRequest("Known the passcode", "Anon"))))
                .andExpect(status().isCreated());
    }

    /**
     * P2-09 (existence leak): a PRIVATE paste must leak nothing via the comments endpoint — not even its
     * existence. Desired: 404 (uniform with every other paste endpoint) for non-owners. Currently
     * the service throws BadRequestException ("Comments are only available for public pastes."),
     * confirming existence to any anonymous caller.
     */
    @Test
    void commentsOnPrivatePasteReturn404ForNonOwners() throws Exception {
        String pasteId = createPaste(Visibility.PRIVATE, ExpirationPolicy.ONE_DAY, null);

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isNotFound());

        // Deleting/reading variants must be uniform as well.
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateCommentRequest("probe", "Anon"))))
                .andExpect(status().isNotFound());
    }

    /**
     * P2-01: internal user identifiers must not be exposed to viewers who are not the comment owner.
     * An anonymous reader should receive NO non-null userId field for other people's comments.
     */
    @Test
    void anonymousCommentListingDoesNotExposeOtherUsersInternalIds() throws Exception {
        String pasteId = createPaste(Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(user(ownerPrincipal))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateCommentRequest("Owner comment", null))))
                .andExpect(status().isCreated());

        MvcResult res = mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/comments"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode comments = objectMapper.readTree(res.getResponse().getContentAsString()).get("comments");
        for (JsonNode comment : comments) {
            if (comment.path("userId").isNumber()) {
                throw new AssertionError(
                        "CommentResponse leaked an internal userId to an anonymous viewer: " + comment);
            }
        }
    }

    /**
     * P2-03: the one-time comment deletion capability must never be accepted from the URL query
     * string. The caller must present it in the X-Comment-Delete-Token header (or JSON body).
     * Desired: 403 when supplied only as a query parameter.
     */
    @Test
    void commentDeletionCapabilityIsNotAcceptableViaQueryString() throws Exception {
        String pasteId = createPaste(Visibility.PUBLIC, ExpirationPolicy.ONE_DAY, null);

        MvcResult res = mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/comments")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateCommentRequest("Deletable note", "Ghost"))))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        Long commentId = body.get("id").asLong();
        String capability = body.get("deletionCapability").asText();

        // Capability in the query string must NOT authorize deletion.
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/comments/" + commentId)
                        .queryParam("deletionCapability", capability)
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }
}
