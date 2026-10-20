package com.pastebin;

import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.Visibility;
import com.pastebin.paste.infrastructure.PasteRepository;
import com.pastebin.paste.scheduler.ExpirationCleanupScheduler;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ObservabilityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PasteRepository pasteRepository;

    @Autowired
    private ExpirationCleanupScheduler expirationCleanupScheduler;

    @Autowired
    private MeterRegistry meterRegistry;

    @Test
    @DisplayName("Correlation ID: Echoes provided X-Correlation-ID and generates one if absent")
    void testCorrelationIdFilter() throws Exception {
        // Provided correlation ID
        mockMvc.perform(get("/actuator/health")
                        .header("X-Correlation-ID", "trace-test-uuid-999"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Correlation-ID", "trace-test-uuid-999"));

        // Generated correlation ID
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Correlation-ID"));
    }

    @Test
    @DisplayName("Actuator Probes: Liveness and Readiness endpoints return UP (200)")
    void testHealthProbes() throws Exception {
        mockMvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));

        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("Actuator Prometheus: Metrics scrape endpoint is exposed and active")
    void testPrometheusEndpoint() throws Exception {
        String response = mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(response).contains("jvm_");
    }

    @Test
    @DisplayName("Reaper: Expiration cleanup scheduler purges expired pastes and increments metric")
    void testExpirationCleanupReaper() {
        // Create an expired paste
        Paste expiredPaste = new Paste(
                "expTestNanoId",
                null,
                "Expired Note",
                "This paste should be purged",
                "plaintext",
                Visibility.PUBLIC,
                26,
                1,
                null,
                Instant.now().minusSeconds(7200) // 2 hours ago
        );
        pasteRepository.save(expiredPaste);

        assertThat(pasteRepository.findByPublicId("expTestNanoId")).isPresent();

        double countBefore = meterRegistry.counter("pastes.expired.purged").count();

        // Run cleanup
        int purged = expirationCleanupScheduler.executeCleanup();

        assertThat(purged).isGreaterThanOrEqualTo(1);
        assertThat(pasteRepository.findByPublicId("expTestNanoId")).isEmpty();

        double countAfter = meterRegistry.counter("pastes.expired.purged").count();
        assertThat(countAfter).isGreaterThan(countBefore);
    }
}
