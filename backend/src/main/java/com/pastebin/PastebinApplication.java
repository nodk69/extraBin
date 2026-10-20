package com.pastebin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
public class PastebinApplication {

    public static void main(String[] args) {
        // Enforce UTC timezone across all JVM operations
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(PastebinApplication.class, args);
    }
}
