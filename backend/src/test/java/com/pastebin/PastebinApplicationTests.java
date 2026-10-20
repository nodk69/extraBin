package com.pastebin;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PastebinApplicationTests {

    @Test
    void contextLoads() {
        // Verifies Spring ApplicationContext starts cleanly and Flyway migrations execute against database
    }
}
