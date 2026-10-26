package com.pastebin.discovery.infrastructure.meilisearch;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meilisearch.sdk.Client;
import com.meilisearch.sdk.Config;
import com.meilisearch.sdk.Index;
import com.meilisearch.sdk.SearchRequest;
import com.meilisearch.sdk.model.SearchResult;
import com.meilisearch.sdk.model.Searchable;
import com.meilisearch.sdk.model.Settings;
import com.meilisearch.sdk.model.TypoTolerance;
import com.pastebin.paste.domain.Paste;
import com.pastebin.paste.domain.PasteFile;
import com.pastebin.paste.domain.Tag;
import com.pastebin.paste.domain.Visibility;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class MeilisearchIndexService {

    private static final Logger log = LoggerFactory.getLogger(MeilisearchIndexService.class);
    private static final int MAX_INDEX_CONTENT_BYTES = 32768; // 32 KB limit per paste content

    private final MeilisearchProperties properties;
    private final ObjectMapper objectMapper;
    private final Counter fallbackCounter;
    private final Counter indexSuccessCounter;
    private final Counter indexFailureCounter;

    private Client client;
    private Index index;
    private final AtomicBoolean isHealthy = new AtomicBoolean(false);

    public MeilisearchIndexService(MeilisearchProperties properties,
                                   ObjectMapper objectMapper,
                                   MeterRegistry meterRegistry) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.fallbackCounter = meterRegistry.counter("pastebin.discovery.search.fallback");
        this.indexSuccessCounter = meterRegistry.counter("pastebin.discovery.index.success");
        this.indexFailureCounter = meterRegistry.counter("pastebin.discovery.index.failure");
    }

    @PostConstruct
    public void init() {
        if (!properties.isEnabled()) {
            log.info("Meilisearch integration is disabled via configuration.");
            return;
        }

        try {
            Config config = new Config(properties.getUrl(), properties.getApiKey());
            this.client = new Client(config);
            this.index = client.index(properties.getIndexName());

            // Test connectivity and configure index settings
            configureIndexSettings();
            isHealthy.set(true);
            log.info("Meilisearch client initialized and connected to index '{}'", properties.getIndexName());
        } catch (Exception ex) {
            log.warn("Could not connect to Meilisearch on startup ({}). Search will fall back to PostgreSQL: {}",
                    properties.getUrl(), ex.getMessage());
            isHealthy.set(false);
        }
    }

    public boolean isAvailable() {
        return properties.isEnabled() && isHealthy.get();
    }

    public void setClient(Client client) {
        this.client = client;
        if (client != null) {
            properties.setEnabled(true);
            this.index = client.index(properties.getIndexName());
            this.isHealthy.set(true);
        } else {
            this.index = null;
            this.isHealthy.set(false);
        }
    }

    /**
     * Configures searchable/filterable attributes and typo tolerance.
     */
    public void configureIndexSettings() {
        if (index == null) return;
        try {
            Settings settings = new Settings();
            settings.setSearchableAttributes(new String[]{"title", "tags", "content", "language"});
            settings.setFilterableAttributes(new String[]{"language", "tags"});
            settings.setSortableAttributes(new String[]{"createdAt", "updatedAt"});

            TypoTolerance typoTolerance = new TypoTolerance();
            typoTolerance.setEnabled(true);
            // Prevent false positive explosions on short programming tokens
            typoTolerance.setDisableOnWords(new String[]{
                    "c", "go", "fn", "id", "sql", "sh", "rs", "js", "ts", "py", "cpp", "rb"
            });
            settings.setTypoTolerance(typoTolerance);

            index.updateSettings(settings);
            log.info("Updated Meilisearch settings for index '{}'", properties.getIndexName());
        } catch (Exception ex) {
            log.warn("Failed to apply Meilisearch settings: {}", ex.getMessage());
        }
    }

    /**
     * Indexes a public paste if eligible according to authoritative domain state.
     * Fails closed: if paste is private, encrypted, or ineligible, it is removed from index.
     */
    public void syncPaste(Paste paste) {
        if (paste == null || !isAvailable()) return;

        try {
            if (!isEligibleForPublicIndex(paste)) {
                deletePaste(paste.getPublicId());
                return;
            }

            MeilisearchPasteDocument doc = toDocument(paste);
            String jsonDoc = objectMapper.writeValueAsString(List.of(doc));
            index.addDocuments(jsonDoc);
            indexSuccessCounter.increment();
        } catch (Exception ex) {
            indexFailureCounter.increment();
            log.error("Failed to sync paste '{}' to Meilisearch: {}", paste.getPublicId(), ex.getMessage());
        }
    }

    /**
     * Deletes a document from the Meilisearch index.
     */
    public void deletePaste(String publicId) {
        if (publicId == null || !isAvailable()) return;
        try {
            index.deleteDocument(publicId);
        } catch (Exception ex) {
            log.error("Failed to delete paste '{}' from Meilisearch: {}", publicId, ex.getMessage());
        }
    }

    /**
     * Batch deletes multiple documents from Meilisearch index.
     */
    public void deletePastes(List<String> publicIds) {
        if (publicIds == null || publicIds.isEmpty() || !isAvailable()) return;
        try {
            index.deleteDocuments(publicIds);
        } catch (Exception ex) {
            log.error("Failed to batch delete pastes from Meilisearch: {}", ex.getMessage());
        }
    }

    /**
     * Executes a search in Meilisearch with pagination and optional filters.
     * Returns matching public IDs. If Meilisearch fails or is unavailable, records fallback metric.
     */
    public MeilisearchSearchResult search(String query, String language, String tag, int page, int size) {
        if (!isAvailable()) {
            fallbackCounter.increment();
            return new MeilisearchSearchResult(List.of(), 0, true);
        }

        try {
            SearchRequest request = new SearchRequest(query);
            request.setLimit(size);
            request.setOffset(page * size);

            List<String> filterClauses = new ArrayList<>();
            if (language != null && !language.isBlank() && !language.equalsIgnoreCase("all")) {
                filterClauses.add("language = '" + language.toLowerCase().trim() + "'");
            }
            if (tag != null && !tag.isBlank()) {
                filterClauses.add("tags = '" + tag.toLowerCase().trim() + "'");
            }

            if (!filterClauses.isEmpty()) {
                request.setFilter(filterClauses.toArray(new String[0]));
            }

            Searchable result = index.search(request);
            List<String> hitIds = new ArrayList<>();
            long estimatedTotalHits = 0;

            if (result instanceof SearchResult searchResult) {
                estimatedTotalHits = searchResult.getEstimatedTotalHits();
                var hits = searchResult.getHits();
                if (hits != null) {
                    for (var hit : hits) {
                        if (hit != null) {
                            Object idObj = hit.get("id");
                            if (idObj != null) {
                                hitIds.add(idObj.toString());
                            }
                        }
                    }
                }
            }

            return new MeilisearchSearchResult(hitIds, estimatedTotalHits, false);
        } catch (Exception ex) {
            log.warn("Meilisearch search failed, degrading to PostgreSQL: {}", ex.getMessage());
            fallbackCounter.increment();
            return new MeilisearchSearchResult(List.of(), 0, true);
        }
    }

    private boolean isEligibleForPublicIndex(Paste paste) {
        if (paste.getVisibility() != Visibility.PUBLIC) return false;
        if (paste.isBurnAfterReading()) return false;
        if (paste.getPasswordHash() != null) return false;
        if (paste.getEncryptionMode() != null) return false;
        if (paste.getModerationState() != com.pastebin.paste.domain.ModerationState.ACTIVE) return false;
        Instant now = Instant.now();
        if (paste.getExpiresAt() != null && paste.getExpiresAt().isBefore(now)) return false;
        return true;
    }

    private MeilisearchPasteDocument toDocument(Paste paste) {
        List<String> tagNames = new ArrayList<>();
        if (paste.getTags() != null) {
            for (Tag t : paste.getTags()) {
                if (t.getName() != null && !t.getName().isBlank()) {
                    tagNames.add(t.getName().toLowerCase().trim());
                }
            }
        }

        StringBuilder contentBuilder = new StringBuilder();
        if (paste.getContent() != null) {
            contentBuilder.append(paste.getContent());
        }

        if (paste.getFiles() != null && !paste.getFiles().isEmpty()) {
            for (PasteFile pf : paste.getFiles()) {
                // Never index encrypted file content
                if (pf.getCiphertext() != null) continue;
                if (contentBuilder.length() >= MAX_INDEX_CONTENT_BYTES) break;
                if (pf.getFilename() != null) {
                    contentBuilder.append(" ").append(pf.getFilename());
                }
                if (pf.getContent() != null) {
                    contentBuilder.append(" ").append(pf.getContent());
                }
            }
        }

        String content = contentBuilder.toString();
        if (content.length() > MAX_INDEX_CONTENT_BYTES) {
            content = content.substring(0, MAX_INDEX_CONTENT_BYTES);
        }

        long createdAt = paste.getCreatedAt() != null ? paste.getCreatedAt().getEpochSecond() : Instant.now().getEpochSecond();
        long updatedAt = paste.getUpdatedAt() != null ? paste.getUpdatedAt().getEpochSecond() : createdAt;

        return new MeilisearchPasteDocument(
                paste.getPublicId(),
                paste.getTitle() != null ? paste.getTitle() : "",
                paste.getLanguage() != null ? paste.getLanguage().toLowerCase() : "plaintext",
                tagNames,
                content,
                createdAt,
                updatedAt
        );
    }
}
