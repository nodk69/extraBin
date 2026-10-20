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
public class SearchAndSortIntegrationTest {

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

        User user1 = userRepository.findByUsername("search_user1")
                .orElseGet(() -> userRepository.save(new User("search_user1", "search1@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));
        User user2 = userRepository.findByUsername("search_user2")
                .orElseGet(() -> userRepository.save(new User("search_user2", "search2@pastebin.local", passwordEncoder.encode("Pass123!"), "ROLE_USER")));

        user1Principal = new PastebinUserPrincipal(user1);
        user2Principal = new PastebinUserPrincipal(user2);
    }

    private String createPasteWithTitle(PastebinUserPrincipal principal, String title, String content) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                title,
                content,
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
    // SEARCH-1: Search by title
    // =========================================================================
    @Test
    void searchByTitle() throws Exception {
        createPasteWithTitle(user1Principal, "Spring Boot Tutorial", "content1");
        createPasteWithTitle(user1Principal, "React Guide", "content2");
        createPasteWithTitle(user1Principal, "Spring Security", "content3");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "Spring"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    // =========================================================================
    // SEARCH-2: Search by content
    // =========================================================================
    @Test
    void searchByContent() throws Exception {
        createPasteWithTitle(user1Principal, "Paste 1", "unique_functionality_xyz");
        createPasteWithTitle(user1Principal, "Paste 2", "normal content");
        createPasteWithTitle(user1Principal, "Paste 3", "another unique_functionality_xyz here");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "unique_functionality_xyz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    // =========================================================================
    // SEARCH-3: Search is case-insensitive
    // =========================================================================
    @Test
    void searchIsCaseInsensitive() throws Exception {
        createPasteWithTitle(user1Principal, "MySpecialPaste", "content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "myspecialpaste"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "MYSPECIALPASTE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    // =========================================================================
    // SEARCH-4: Search across multiple fields
    // =========================================================================
    @Test
    void searchAcrossMultipleFields() throws Exception {
        createPasteWithTitle(user1Principal, "Java Tutorial", "Python code here");
        createPasteWithTitle(user1Principal, "Python Guide", "Java content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "Java"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    // =========================================================================
    // SEARCH-5: User A cannot search User B's pastes
    // =========================================================================
    @Test
    void userACannotSearchUserBPastes() throws Exception {
        createPasteWithTitle(user1Principal, "User1 Private Paste", "secret content");
        createPasteWithTitle(user2Principal, "User2 Private Paste", "other content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user2Principal))
                        .param("search", "secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    // =========================================================================
    // SEARCH-6: Search with pagination
    // =========================================================================
    @Test
    void searchWithPagination() throws Exception {
        for (int i = 0; i < 25; i++) {
            createPasteWithTitle(user1Principal, "Test Paste " + i, "searchable content");
        }

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "searchable")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(10))
                .andExpect(jsonPath("$.totalElements").value(25))
                .andExpect(jsonPath("$.totalPages").value(3));
    }

    // =========================================================================
    // SEARCH-7: Empty search returns all pastes
    // =========================================================================
    @Test
    void emptySearchReturnsAllPastes() throws Exception {
        createPasteWithTitle(user1Principal, "Paste 1", "content1");
        createPasteWithTitle(user1Principal, "Paste 2", "content2");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    // =========================================================================
    // SORT-1: Sort by recently updated
    // =========================================================================
    @Test
    void sortByRecentlyUpdated() throws Exception {
        String paste1 = createPasteWithTitle(user1Principal, "First", "content");
        Thread.sleep(10);
        String paste2 = createPasteWithTitle(user1Principal, "Second", "content");
        Thread.sleep(10);
        String paste3 = createPasteWithTitle(user1Principal, "Third", "content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("sort", "updatedAt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(paste3))
                .andExpect(jsonPath("$.items[1].id").value(paste2))
                .andExpect(jsonPath("$.items[2].id").value(paste1));
    }

    // =========================================================================
    // SORT-2: Sort by recently created
    // =========================================================================
    @Test
    void sortByRecentlyCreated() throws Exception {
        String paste1 = createPasteWithTitle(user1Principal, "First", "content");
        Thread.sleep(10);
        String paste2 = createPasteWithTitle(user1Principal, "Second", "content");
        Thread.sleep(10);
        String paste3 = createPasteWithTitle(user1Principal, "Third", "content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("sort", "createdAt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(paste3))
                .andExpect(jsonPath("$.items[1].id").value(paste2))
                .andExpect(jsonPath("$.items[2].id").value(paste1));
    }

    // =========================================================================
    // SORT-3: Sort alphabetically by title
    // =========================================================================
    @Test
    void sortAlphabeticallyByTitle() throws Exception {
        createPasteWithTitle(user1Principal, "Zebra", "content");
        createPasteWithTitle(user1Principal, "Apple", "content");
        createPasteWithTitle(user1Principal, "Mango", "content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("sort", "title"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].title").value("Apple"))
                .andExpect(jsonPath("$.items[1].title").value("Mango"))
                .andExpect(jsonPath("$.items[2].title").value("Zebra"));
    }

    // =========================================================================
    // SORT-4: Sort direction (ascending/descending)
    // =========================================================================
    @Test
    void sortDirectionAscending() throws Exception {
        createPasteWithTitle(user1Principal, "Zebra", "content");
        createPasteWithTitle(user1Principal, "Apple", "content");
        createPasteWithTitle(user1Principal, "Mango", "content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("sort", "title")
                        .param("direction", "asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].title").value("Apple"))
                .andExpect(jsonPath("$.items[2].title").value("Zebra"));
    }

    // =========================================================================
    // SORT-5: Invalid sort parameter
    // =========================================================================
    @Test
    void invalidSortParameter() throws Exception {
        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("sort", "invalidField"))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // SORT-6: Combined search and sort
    // =========================================================================
    @Test
    void combinedSearchAndSort() throws Exception {
        createPasteWithTitle(user1Principal, "Spring Boot", "content");
        Thread.sleep(10);
        createPasteWithTitle(user1Principal, "Spring Security", "content");
        Thread.sleep(10);
        createPasteWithTitle(user1Principal, "React Guide", "content");

        mockMvc.perform(get("/api/v1/account/pastes")
                        .with(user(user1Principal))
                        .param("search", "Spring")
                        .param("sort", "createdAt"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].title").value("Spring Security"))
                .andExpect(jsonPath("$.items[1].title").value("Spring Boot"));
    }
}
