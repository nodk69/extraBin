package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.EditPasteRequest;
import com.pastebin.paste.api.dto.UpdateSlugRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.shared.security.RateLimiterService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * TC-01..06: the Trending cache never costs a database round trip on a hit and never serves a paste
 * that has stopped being publicly discoverable.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrendingCacheConsistencyIntegrationTest {

    private static final String PASSWORD = "SecretPass123!";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RateLimiterService rateLimiterService;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ConnectionCounter connectionCounter;

    private String uid;

    @TestConfiguration
    static class CountingDataSourceConfig {
        @Bean
        ConnectionCounter connectionCounter() {
            return new ConnectionCounter();
        }

        @Bean
        static BeanPostProcessor countingDataSourcePostProcessor(org.springframework.beans.factory.ObjectProvider<ConnectionCounter> counter) {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String beanName) {
                    if (bean instanceof DataSource ds && !(bean instanceof CountingDataSource)) {
                        return new CountingDataSource(ds, counter);
                    }
                    return bean;
                }
            };
        }
    }

    static class ConnectionCounter {
        private volatile Thread watched;
        private final AtomicInteger acquired = new AtomicInteger();

        void watchCurrentThread() {
            acquired.set(0);
            watched = Thread.currentThread();
        }

        int stop() {
            watched = null;
            return acquired.get();
        }

        void onAcquire() {
            if (Thread.currentThread() == watched) {
                acquired.incrementAndGet();
            }
        }
    }

    static class CountingDataSource extends DelegatingDataSource {
        private final org.springframework.beans.factory.ObjectProvider<ConnectionCounter> counter;

        CountingDataSource(DataSource target, org.springframework.beans.factory.ObjectProvider<ConnectionCounter> counter) {
            super(target);
            this.counter = counter;
        }

        @Override
        public Connection getConnection() throws SQLException {
            counter.getObject().onAcquire();
            return super.getConnection();
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            counter.getObject().onAcquire();
            return super.getConnection(username, password);
        }
    }

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
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(username, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) login.getRequest().getSession();
    }

    private JsonNode createPaste(MockHttpSession session, String title, String language) throws Exception {
        var request = post("/api/v1/pastes").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                        new CreatePasteRequest(title, "content", language, Visibility.PUBLIC, ExpirationPolicy.NEVER)));
        if (session != null) {
            request.session(session);
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private void recordActivity(String publicId) {
        jdbc.update("INSERT INTO paste_activity_events (paste_id, event_type, client_ip_hash, created_at) "
                + "SELECT id, 'VIEW', ?, ? FROM pastes WHERE public_id = ?",
                "trend-" + uid, Timestamp.from(Instant.now()), publicId);
    }

    private List<String> trendingIds(String language) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/discovery/trending?window=24h&size=10&language=" + language))
                .andExpect(status().isOk())
                .andReturn();
        List<String> ids = new ArrayList<>();
        objectMapper.readTree(result.getResponse().getContentAsString()).get("items").forEach(n -> ids.add(n.get("id").asText()));
        return ids;
    }

    private String trendingPaste(MockHttpSession owner, String language) throws Exception {
        return trendingPaste(owner, language, true);
    }

    // Delete tests skip activity rows: the test profile's create-drop schema lacks V17's ON DELETE CASCADE.
    // Without activity the paste reaches Trending via the cold-start fallback, which is cached identically.
    private String trendingPaste(MockHttpSession owner, String language, boolean withActivity) throws Exception {
        String id = createPaste(owner, "Trending " + uid, language).get("id").asText();
        if (withActivity) {
            recordActivity(id);
        }
        assertEquals(List.of(id), trendingIds(language), "precondition: paste is trending and now cached");
        return id;
    }

    @Test
    void TC_01_cacheHit_acquiresNoJdbcConnection() throws Exception {
        MockHttpSession owner = registerAndLogin("tc01" + uid);
        String lang = "tc01" + uid;
        String id = trendingPaste(owner, lang);

        connectionCounter.watchCurrentThread();
        List<String> again = trendingIds(lang);
        int acquired = connectionCounter.stop();

        assertEquals(List.of(id), again);
        assertEquals(0, acquired, "a Trending cache hit must not acquire a JDBC connection");
    }

    @Test
    void TC_02_madePrivate_removedImmediately() throws Exception {
        MockHttpSession owner = registerAndLogin("tc02" + uid);
        String lang = "tc02" + uid;
        String id = trendingPaste(owner, lang);
        Long version = jdbc.queryForObject("SELECT version FROM pastes WHERE public_id = ?", Long.class, id);

        mockMvc.perform(put("/api/v1/account/pastes/" + id).with(csrf()).session(owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new EditPasteRequest("Trending " + uid, "content", lang, Visibility.PRIVATE, version))))
                .andExpect(status().isOk());

        assertFalse(trendingIds(lang).contains(id), "a paste made private must leave Trending immediately");
    }

    @Test
    void TC_03_ownerDelete_removedImmediately() throws Exception {
        MockHttpSession owner = registerAndLogin("tc03" + uid);
        String lang = "tc03" + uid;
        String id = trendingPaste(owner, lang, false);

        mockMvc.perform(delete("/api/v1/account/pastes/" + id).with(csrf()).session(owner))
                .andExpect(status().is2xxSuccessful());

        assertFalse(trendingIds(lang).contains(id), "a deleted paste must leave Trending immediately");
    }

    @Test
    void TC_04_anonymousDelete_removedImmediately() throws Exception {
        String lang = "tc04" + uid;
        JsonNode created = createPaste(null, "Anon trending " + uid, lang);
        String id = created.get("id").asText();
        assertEquals(List.of(id), trendingIds(lang), "precondition: anonymous paste is trending and cached");

        mockMvc.perform(post("/api/v1/pastes/" + id + "/delete-anonymous").with(csrf())
                        .header("X-Deletion-Capability", created.get("deletionCapability").asText()))
                .andExpect(status().is2xxSuccessful());

        assertFalse(trendingIds(lang).contains(id), "an anonymously deleted paste must leave Trending immediately");
    }

    @Test
    void TC_05_slugChange_servesNewLinkImmediately() throws Exception {
        MockHttpSession owner = registerAndLogin("tc05" + uid);
        String lang = "tc05" + uid;
        String id = trendingPaste(owner, lang);
        String slug = "slug" + uid;

        mockMvc.perform(patch("/api/v1/pastes/" + id + "/slug").with(csrf()).session(owner)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateSlugRequest(slug, null))))
                .andExpect(status().isOk());

        assertEquals(List.of(slug), trendingIds(lang), "Trending must link to the paste's current slug");
    }

    @Test
    void TC_06_expiredAfterCaching_filteredWhenServed() throws Exception {
        MockHttpSession owner = registerAndLogin("tc06" + uid);
        String lang = "tc06" + uid;
        String id = createPaste(owner, "Trending " + uid, lang).get("id").asText();
        recordActivity(id);
        Instant expiresAt = Instant.now().plusSeconds(8);
        jdbc.update("UPDATE pastes SET expires_at = ? WHERE public_id = ?", Timestamp.from(expiresAt), id);
        assertEquals(List.of(id), trendingIds(lang), "precondition: paste with a known expiry is trending and cached");

        long waitMillis = expiresAt.toEpochMilli() - System.currentTimeMillis() + 500;
        if (waitMillis > 0) {
            Thread.sleep(waitMillis);
        }

        assertTrue(trendingIds(lang).isEmpty(), "a paste that expired after caching must not be served from the cache");
    }
}
