package com.pastebin.paste.domain;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component
public class NanoIdGenerator {

    private static final char[] ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".toCharArray();
    private static final int DEFAULT_SIZE = 10;
    private final SecureRandom secureRandom = new SecureRandom();

    public String generate() {
        return generate(DEFAULT_SIZE);
    }

    public String generate(int size) {
        if (size <= 0) {
            throw new IllegalArgumentException("Size must be greater than zero.");
        }
        char[] chars = new char[size];
        for (int i = 0; i < size; i++) {
            chars[i] = ALPHABET[secureRandom.nextInt(ALPHABET.length)];
        }
        return new String(chars);
    }
}
