package com.pastebin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.api.dto.DeleteAnonymousPasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasteLifecycleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void completeAnonymousPasteLifecycle() throws Exception {
        // 1. Create anonymous paste
        CreatePasteRequest createRequest = new CreatePasteRequest(
                "Lifecycle Test",
                "console.log('Hello, PasteBin lifecycle!');\nconst a = 10;",
                "javascript",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );

        MvcResult createResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.deletionCapability").isNotEmpty())
                .andExpect(jsonPath("$.lineCount").value(2))
                .andReturn();

        JsonNode createdNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        String pasteId = createdNode.get("id").asText();
        String deletionCapability = createdNode.get("deletionCapability").asText();

        // 2. Fetch paste view
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pasteId))
                .andExpect(jsonPath("$.title").value("Lifecycle Test"))
                .andExpect(jsonPath("$.language").value("javascript"))
                .andExpect(jsonPath("$.isOwner").value(false))
                .andExpect(jsonPath("$.content").value("console.log('Hello, PasteBin lifecycle!');\nconst a = 10;"));

        // 3. Fetch raw content
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/plain;charset=UTF-8"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "private, no-cache, no-store, must-revalidate"))
                .andExpect(content().string("console.log('Hello, PasteBin lifecycle!');\nconst a = 10;"));

        // 4. Download content
        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/download"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"Lifecycle_Test.js\""))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().string("console.log('Hello, PasteBin lifecycle!');\nconst a = 10;"));

        // 5. Delete using one-time deletion capability
        DeleteAnonymousPasteRequest deleteRequest = new DeleteAnonymousPasteRequest(deletionCapability);

        mockMvc.perform(post("/api/v1/pastes/" + pasteId + "/delete-anonymous")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteRequest)))
                .andExpect(status().isNoContent());

        // 6. Verify paste is no longer accessible
        mockMvc.perform(get("/api/v1/pastes/" + pasteId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        mockMvc.perform(get("/api/v1/pastes/" + pasteId + "/raw"))
                .andExpect(status().isNotFound());
    }
}
