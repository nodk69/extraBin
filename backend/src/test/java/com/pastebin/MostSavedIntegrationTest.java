package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MS-01..MS-07: Most-saved discovery view over real persisted star relationships.
 * Contract: GET /api/v1/discovery/most-saved?language=&page=&size= -> eligible pastes with stars_count > 0,
 * ordered stars_count DESC then id ASC. "Save" is the existing star feature; no second save system.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MostSavedIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RateLimiterService rateLimiterService;
    @Autowired
    private JdbcTemplate jdbc;

    private String uid;

    @BeforeEach
    void setUp() {
        rateLimiterService.clear();
        uid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    private MockHttpSession registerAndLogin(String username) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RegisterRequest(username, username + "@example.com", PASSWORD))))
                .andExpect(status().isCreated());
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) loginResult.getRequest().getSession();
    }

    private String createPaste(MockHttpSession session, String title, String language) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/pastes").with(csrf()).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new CreatePasteRequest(title, "content", language, Visibility.PUBLIC, ExpirationPolicy.NEVER))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void star(MockHttpSession user, String pasteId) throws Exception {
        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/star").with(csrf()).session(user))
                .andExpect(status().isOk());
    }

    private void unstar(MockHttpSession user, String pasteId) throws Exception {
        mockMvc.perform(delete("/api/v1/pastes/" + pasteId + "/star").with(csrf()).session(user))
                .andExpect(status().isOk());
    }

    private JsonNode fetchMostSaved(String language) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery/most-saved?language=" + language + "&size=10"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
    }

    private List<String> ids(JsonNode items) {
        List<String> out = new ArrayList<>();
        items.forEach(n -> out.add(n.get("id").asText()));
        return out;
    }

    // MS-01: ordering by real star counts, starsCount exposed additively
    @Test
    void MS_01_mostSaved_ordersByStarCount() throws Exception {
        MockHttpSession author = registerAndLogin("ms01a" + uid);
        MockHttpSession u1 = registerAndLogin("ms01u1" + uid);
        MockHttpSession u2 = registerAndLogin("ms01u2" + uid);
        MockHttpSession u3 = registerAndLogin("ms01u3" + uid);
        String lang = "ms01" + uid;

        String p3 = createPaste(author, "MS01 three stars " + uid, lang);
        String p2 = createPaste(author, "MS01 two stars " + uid, lang);
        String p1 = createPaste(author, "MS01 one star " + uid, lang);

        star(u1, p3);
        star(u2, p3);
        star(u3, p3);
        star(u1, p2);
        star(u2, p2);
        star(u1, p1);

        JsonNode items = fetchMostSaved(lang);
        List<String> order = ids(items);
        assertEquals(List.of(p3, p2, p1), order, "most-saved must order by distinct star count DESC");
        assertEquals(3, items.get(0).get("starsCount").asLong(), "starsCount must be exposed on summary");
    }

    // MS-02: ties resolve deterministically by id ASC
    @Test
    void MS_02_ties_resolveByIdAscending() throws Exception {
        MockHttpSession author = registerAndLogin("ms02a" + uid);
        MockHttpSession u1 = registerAndLogin("ms02u1" + uid);
        MockHttpSession u2 = registerAndLogin("ms02u2" + uid);
        String lang = "ms02" + uid;

        String a = createPaste(author, "MS02 tie A " + uid, lang);
        String b = createPaste(author, "MS02 tie B " + uid, lang);
        star(u1, a);
        star(u2, b);

        List<String> order = ids(fetchMostSaved(lang));
        List<String> sorted = new ArrayList<>(order);
        sorted.sort(String::compareTo);
        assertEquals(sorted, order, "equal star counts must order by id ASC");
    }

    // MS-03: star then unstar removes the paste from most-saved
    @Test
    void MS_03_unstar_reflectsImmediately() throws Exception {
        MockHttpSession author = registerAndLogin("ms03a" + uid);
        MockHttpSession u1 = registerAndLogin("ms03u1" + uid);
        String lang = "ms03" + uid;

        String p = createPaste(author, "MS03 star-unstar " + uid, lang);
        star(u1, p);
        assertEquals(List.of(p), ids(fetchMostSaved(lang)), "starred paste must appear");

        unstar(u1, p);
        assertTrue(ids(fetchMostSaved(lang)).isEmpty(), "unstarred paste must drop out of most-saved");
    }

    // MS-04: concurrent star/unstar keeps counts exact
    @Test
    void MS_04_concurrentStars_keepCountExact() throws Exception {
        MockHttpSession author = registerAndLogin("ms04a" + uid);
        String lang = "ms04" + uid;
        String p = createPaste(author, "MS04 concurrency " + uid, lang);

        List<MockHttpSession> users = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            users.add(registerAndLogin("ms04u" + i + uid));
        }

        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<?>> futures = new ArrayList<>();
            for (MockHttpSession user : users) {
                futures.add(pool.submit((Callable<Object>) () -> {
                    start.await();
                    mockMvc.perform(post("/api/v1/pastes/" + p + "/star").with(csrf()).session(user))
                            .andExpect(status().isOk());
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> f : futures) {
                f.get(30, TimeUnit.SECONDS);
            }

            Long rows = jdbc.queryForObject("SELECT COUNT(*) FROM paste_stars WHERE paste_id = (SELECT id FROM pastes WHERE public_id = ?)", Long.class, p);
            Long denorm = jdbc.queryForObject("SELECT stars_count FROM pastes WHERE public_id = ?", Long.class, p);
            assertEquals(4L, rows, "exactly one star row per distinct user must persist");
            assertEquals(4L, denorm, "denormalized stars_count must equal persisted rows");

            CountDownLatch start2 = new CountDownLatch(1);
            List<Future<?>> unstars = new ArrayList<>();
            for (MockHttpSession user : users) {
                unstars.add(pool.submit((Callable<Object>) () -> {
                    start2.await();
                    mockMvc.perform(delete("/api/v1/pastes/" + p + "/star").with(csrf()).session(user))
                            .andExpect(status().isOk());
                    return null;
                }));
            }
            start2.countDown();
            for (Future<?> f : unstars) {
                f.get(30, TimeUnit.SECONDS);
            }

            Long rowsAfter = jdbc.queryForObject("SELECT COUNT(*) FROM paste_stars WHERE paste_id = (SELECT id FROM pastes WHERE public_id = ?)", Long.class, p);
            Long denormAfter = jdbc.queryForObject("SELECT stars_count FROM pastes WHERE public_id = ?", Long.class, p);
            assertEquals(0L, rowsAfter, "concurrent unstars must remove all rows");
            assertEquals(0L, denormAfter, "denormalized stars_count must return to zero");
            assertTrue(ids(fetchMostSaved(lang)).isEmpty(), "paste with zero stars must not appear in most-saved");
        } finally {
            pool.shutdownNow();
        }
    }

    // MS-05: no starred eligible pastes -> honest empty state (no invented data)
    @Test
    void MS_05_zeroStars_emptyResult() throws Exception {
        MockHttpSession author = registerAndLogin("ms05a" + uid);
        String lang = "ms05" + uid;
        createPaste(author, "MS05 unstarred " + uid, lang);

        assertTrue(ids(fetchMostSaved(lang)).isEmpty(), "no saves in dataset must produce an empty most-saved list");
    }

    // MS-06: moderation-hidden and expired pastes are excluded even when starred
    @Test
    void MS_06_ineligibleStarredPastes_excluded() throws Exception {
        MockHttpSession author = registerAndLogin("ms06a" + uid);
        MockHttpSession u1 = registerAndLogin("ms06u1" + uid);
        String lang = "ms06" + uid;

        String hidden = createPaste(author, "MS06 hidden " + uid, lang);
        String expired = createPaste(author, "MS06 expired " + uid, lang);
        star(u1, hidden);
        star(u1, expired);

        jdbc.update("UPDATE pastes SET moderation_state = 'HIDDEN' WHERE public_id = ?", hidden);
        jdbc.update("UPDATE pastes SET expires_at = ? WHERE public_id = ?", java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(60)), expired);

        assertTrue(ids(fetchMostSaved(lang)).isEmpty(), "starred but ineligible pastes must not appear in most-saved");
    }

    // MS-07: language filter on most-saved; zero-star pastes excluded when others have stars
    @Test
    void MS_07_languageFilter_andZeroStarExclusion() throws Exception {
        MockHttpSession author = registerAndLogin("ms07a" + uid);
        MockHttpSession u1 = registerAndLogin("ms07u1" + uid);
        String lang = "ms07" + uid;

        String starred = createPaste(author, "MS07 starred " + uid, lang);
        String plain = createPaste(author, "MS07 plain " + uid, lang);
        star(u1, starred);

        List<String> order = ids(fetchMostSaved(lang));
        assertEquals(List.of(starred), order, "only the starred paste must appear; zero-star paste excluded");
    }
}
