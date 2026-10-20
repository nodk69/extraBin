package com.pastebin;

import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.support.ShareTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RED-PHASE tests for burn-after-reading share semantics.
 *
 * <p>Metadata/preview surfaces must never consume a burn-after-reading paste. Only the
 * content-delivery surfaces (raw/download) consume it, and exactly one concurrent
 * consumer may succeed.</p>
 */
class BurnAfterReadingShareSemanticsIntegrationTest extends ShareTestSupport {

    private String burnPaste() throws Exception {
        return createPasteViaApi("Burn share fixture", "burn-once body", Visibility.PUBLIC,
                ExpirationPolicy.BURN_AFTER_READING, null, null);
    }

    @Test
    void burnPaste_ogShell_doesNotConsumePaste() throws Exception {
        String id = burnPaste();

        mockMvc.perform(get("/p/" + id).accept(MediaType.TEXT_HTML))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk());
    }

    @Test
    void burnPaste_shareDescriptor_doesNotConsumePaste() throws Exception {
        String id = burnPaste();

        mockMvc.perform(get("/api/v1/pastes/{id}/share", id))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk());
    }

    @Test
    void burnPaste_embedIneligible_doesNotConsumePaste() throws Exception {
        String id = burnPaste();

        mockMvc.perform(get("/api/v1/pastes/{id}/embed", id))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk());
    }

    @Test
    void burnPaste_rawConsumesExactlyOnce() throws Exception {
        String id = burnPaste();

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void burnPaste_downloadConsumesExactlyOnce() throws Exception {
        String id = burnPaste();

        mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/{id}/download", id))
                .andExpect(status().isNotFound());
    }

    @Test
    void burnPaste_passwordUnlock_doesNotConsumeUntilContentRead() throws Exception {
        String password = "burn-unlock-pass";
        String id = createPasteViaApi("Password burn fixture", "password burn body", Visibility.PUBLIC,
                ExpirationPolicy.BURN_AFTER_READING, password, null);

        String unlockBody = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/pastes/{id}/unlock", id)
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String token = objectMapper.readTree(unlockBody).get("unlockToken").asText();

        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Unlock", token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/pastes/{id}/raw", id).header("X-Paste-Unlock", token))
                .andExpect(status().isNotFound());
    }

    @Test
    void burnPaste_concurrentRawReads_onlyOneSucceeds() throws Exception {
        String id = burnPaste();
        int readers = 4;

        ExecutorService pool = Executors.newFixedThreadPool(readers);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < readers; i++) {
                futures.add(pool.submit(() -> {
                    start.await(5, TimeUnit.SECONDS);
                    return mockMvc.perform(get("/api/v1/pastes/{id}/raw", id))
                            .andReturn()
                            .getResponse()
                            .getStatus();
                }));
            }
            start.countDown();

            long successes = 0;
            for (Future<Integer> future : futures) {
                int status = future.get(15, TimeUnit.SECONDS);
                if (status == 200) {
                    successes++;
                }
            }
            assertThat(successes).as("exactly one concurrent burn-after-reading read may succeed").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
