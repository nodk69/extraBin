package com.pastebin.discovery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meilisearch.sdk.Client;
import com.meilisearch.sdk.Config;
import com.meilisearch.sdk.Index;
import com.pastebin.discovery.infrastructure.meilisearch.MeilisearchIndexService;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class MeilisearchIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MeilisearchIndexService meilisearchIndexService;

    private Client mockMeiliClient;
    private Index mockMeiliIndex;

    @BeforeEach
    void setUp() {
        mockMeiliClient = Mockito.mock(Client.class);
        mockMeiliIndex = Mockito.mock(Index.class);
        when(mockMeiliClient.index(any())).thenReturn(mockMeiliIndex);
    }

    private String createPaste(String title, String content, String language, Visibility visibility) throws Exception {
        CreatePasteRequest request = new CreatePasteRequest(
                title,
                content,
                language,
                visibility,
                ExpirationPolicy.NEVER
        );

        MvcResult result = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        return json.get("id").asText();
    }

    @Test
    void exactKeywordMatch_andTypoTolerantMatch_routedThroughMeilisearch() throws Exception {
        String marker = "testmarker_" + UUID.randomUUID().toString().substring(0, 8);
        String publicId = createPaste("Introduction to Javascript", "Content with " + marker, "javascript", Visibility.PUBLIC);

        // Configure mock index behavior for typo search
        com.meilisearch.sdk.model.SearchResult mockSearchResult = Mockito.mock(com.meilisearch.sdk.model.SearchResult.class);
        java.util.ArrayList<java.util.HashMap<String, Object>> hitsList = new java.util.ArrayList<>();
        java.util.HashMap<String, Object> hitMap = new java.util.HashMap<>();
        hitMap.put("id", publicId);
        hitsList.add(hitMap);

        when(mockSearchResult.getHits()).thenReturn(hitsList);
        when(mockSearchResult.getEstimatedTotalHits()).thenReturn(1);
        when(mockMeiliIndex.search(any(com.meilisearch.sdk.SearchRequest.class))).thenReturn(mockSearchResult);

        meilisearchIndexService.setClient(mockMeiliClient);

        // 1. Search with typo 'javscript' -> hits mock Meilisearch -> returns candidate -> PostgreSQL verifies -> returns 200
        MvcResult searchRes = mockMvc.perform(get("/api/v1/discovery?q=javscript"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(searchRes.getResponse().getContentAsString());
        assertEquals(1, body.get("items").size());
        assertEquals(publicId, body.get("items").get(0).get("id").asText());
    }

    @Test
    void privateAndUnlistedPastes_neverReturnedEvenIfReturnedByMeilisearch() throws Exception {
        // Create an UNLISTED paste
        String unlistedId = createPaste("Private snippet", "Secret details", "plaintext", Visibility.UNLISTED);

        // Simulate stale or malicious index candidate hit pointing to the unlisted paste
        com.meilisearch.sdk.model.SearchResult mockSearchResult = Mockito.mock(com.meilisearch.sdk.model.SearchResult.class);
        java.util.ArrayList<java.util.HashMap<String, Object>> hitsList = new java.util.ArrayList<>();
        java.util.HashMap<String, Object> hitMap = new java.util.HashMap<>();
        hitMap.put("id", unlistedId);
        hitsList.add(hitMap);

        when(mockSearchResult.getHits()).thenReturn(hitsList);
        when(mockSearchResult.getEstimatedTotalHits()).thenReturn(1);
        when(mockMeiliIndex.search(any(com.meilisearch.sdk.SearchRequest.class))).thenReturn(mockSearchResult);

        meilisearchIndexService.setClient(mockMeiliClient);

        // Search executed: batch filter must discard unlistedId
        MvcResult searchRes = mockMvc.perform(get("/api/v1/discovery?q=snippet"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(searchRes.getResponse().getContentAsString());
        assertEquals(0, body.get("items").size(), "Unlisted/private paste must be filtered out by authoritative PostgreSQL verification");
    }

    @Test
    void meilisearchOutage_gracefullyFallsBackToDatabaseSearch() throws Exception {
        String uniqueWord = "fallbackprobe" + UUID.randomUUID().toString().substring(0, 6);
        String publicId = createPaste("PostgreSQL Fallback Title", "Testing database search " + uniqueWord, "plaintext", Visibility.PUBLIC);

        // Simulate Meilisearch outage: search throws runtime exception
        when(mockMeiliIndex.search(any(com.meilisearch.sdk.SearchRequest.class))).thenThrow(new RuntimeException("Meilisearch connection timeout"));
        meilisearchIndexService.setClient(mockMeiliClient);

        // Search must not return 500: it degrades gracefully to findDiscoveryPastes
        MvcResult searchRes = mockMvc.perform(get("/api/v1/discovery?q=" + uniqueWord))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(searchRes.getResponse().getContentAsString());
        assertEquals(1, body.get("items").size());
        assertEquals(publicId, body.get("items").get(0).get("id").asText());
    }
}
