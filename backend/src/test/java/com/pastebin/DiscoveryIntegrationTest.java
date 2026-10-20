package com.pastebin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pastebin.identity.api.dto.LoginRequest;
import com.pastebin.identity.api.dto.RegisterRequest;
import com.pastebin.paste.api.dto.CreatePasteRequest;
import com.pastebin.paste.domain.ExpirationPolicy;
import com.pastebin.paste.domain.Visibility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DiscoveryIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void discoveryFeed_includesOnlyActivePublicPastes() throws Exception {
        // 1. Create a public Java paste
        CreatePasteRequest publicJava = new CreatePasteRequest(
                "Public Java Discovery",
                "System.out.println('Public');",
                "java",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY
        );
        String pubResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(publicJava)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String publicJavaId = objectMapper.readTree(pubResult).get("id").asText();

        // 2. Create an unlisted Java paste
        CreatePasteRequest unlistedJava = new CreatePasteRequest(
                "Unlisted Java Secret",
                "System.out.println('Unlisted');",
                "java",
                Visibility.UNLISTED,
                ExpirationPolicy.ONE_DAY
        );
        String unlistedResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unlistedJava)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String unlistedJavaId = objectMapper.readTree(unlistedResult).get("id").asText();

        // 3. Register user and create private Python paste
        RegisterRequest regReq = new RegisterRequest("eve", "eve@example.com", "Password123!");
        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(regReq)))
                .andExpect(status().isCreated());

        MvcResult loginRes = mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest("eve", "Password123!"))))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession eveSession = (MockHttpSession) loginRes.getRequest().getSession();

        CreatePasteRequest privatePython = new CreatePasteRequest(
                "Private Python Secret",
                "print('Private')",
                "python",
                Visibility.PRIVATE,
                ExpirationPolicy.ONE_DAY
        );
        String privateResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .session(eveSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(privatePython)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String privatePythonId = objectMapper.readTree(privateResult).get("id").asText();

        // 4. Create a password-protected public Java paste (P1-07 hardened: must be excluded from discovery)
        CreatePasteRequest passwordProtectedJava = new CreatePasteRequest(
                "Protected Java Vault",
                "System.out.println('Protected');",
                "java",
                Visibility.PUBLIC,
                ExpirationPolicy.ONE_DAY,
                "secret-vault-pass"
        );
        String pwResult = mockMvc.perform(post("/api/v1/pastes")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(passwordProtectedJava)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String pwJavaId = objectMapper.readTree(pwResult).get("id").asText();

        // 5. Query public discovery feed -> MUST contain publicJavaId, MUST NOT contain unlistedJavaId, privatePythonId, or pwJavaId
        mockMvc.perform(get("/api/v1/discovery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItem(publicJavaId)))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(unlistedJavaId))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(privatePythonId))))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(pwJavaId))));

        // 6. Query public discovery with language filter
        mockMvc.perform(get("/api/v1/discovery?language=java"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItem(publicJavaId)))
                .andExpect(jsonPath("$.items[*].id", not(hasItem(pwJavaId))));

        mockMvc.perform(get("/api/v1/discovery?language=python"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", not(hasItem(privatePythonId))));
    }
}
