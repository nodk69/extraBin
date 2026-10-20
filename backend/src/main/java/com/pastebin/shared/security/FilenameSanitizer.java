package com.pastebin.shared.security;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class FilenameSanitizer {

    public static final int MAX_FILENAME_LENGTH = 200;

    private static final Pattern RESERVED_DEVICE_NAMES = Pattern.compile(
            "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?$",
            Pattern.CASE_INSENSITIVE
    );

    private FilenameSanitizer() {
    }

    public static String sanitizeForDownload(String filename, String fallbackPublicId) {
        if (filename == null || filename.isBlank()) {
            return "paste-" + (fallbackPublicId != null && !fallbackPublicId.isBlank() ? fallbackPublicId : "file");
        }

        String sanitized = sanitizeBase(filename);

        if (sanitized.isBlank()) {
            return "paste-" + (fallbackPublicId != null && !fallbackPublicId.isBlank() ? fallbackPublicId : "file");
        }

        if (isReservedDeviceName(sanitized)) {
            sanitized = "extra-bin-" + sanitized;
        }

        return truncatePreservingExtension(sanitized, MAX_FILENAME_LENGTH);
    }

    public static String sanitizeForZipEntry(String filename) {
        if (filename == null || filename.isBlank()) {
            return "untitled.txt";
        }

        String sanitized = sanitizeBase(filename);

        if (sanitized.isBlank()) {
            return "untitled.txt";
        }

        if (isReservedDeviceName(sanitized)) {
            sanitized = "extra-bin-" + sanitized;
        }

        return truncatePreservingExtension(sanitized, MAX_FILENAME_LENGTH);
    }

    public static boolean isPureAscii(String str) {
        if (str == null) return true;
        for (int i = 0; i < str.length(); i++) {
            if (str.charAt(i) > 127) {
                return false;
            }
        }
        return true;
    }

    public static org.springframework.http.ContentDisposition buildContentDisposition(String filename) {
        if (isPureAscii(filename)) {
            return org.springframework.http.ContentDisposition.attachment()
                    .filename(filename)
                    .build();
        }

        // For non-ASCII filenames, create ASCII fallback for filename= and UTF-8 encoded filename*=
        StringBuilder ascii = new StringBuilder(filename.length());
        for (int i = 0; i < filename.length(); i++) {
            char c = filename.charAt(i);
            if (c >= 32 && c <= 126 && c != '"' && c != '\\') {
                ascii.append(c);
            } else {
                ascii.append('_');
            }
        }
        String fallback = ascii.toString().trim();
        if (fallback.isBlank()) {
            fallback = "download";
        }

        return org.springframework.http.ContentDisposition.attachment()
                .filename(fallback)
                .filename(filename, java.nio.charset.StandardCharsets.UTF_8)
                .build();
    }

    public static List<String> sanitizeAndDeduplicateForZip(List<String> rawFilenames) {
        if (rawFilenames == null || rawFilenames.isEmpty()) {
            return List.of();
        }

        List<String> sanitized = new ArrayList<>(rawFilenames.size());
        for (String raw : rawFilenames) {
            sanitized.add(sanitizeForZipEntry(raw));
        }

        Set<String> takenCaseInsensitive = new HashSet<>();
        for (String name : sanitized) {
            takenCaseInsensitive.add(name.toLowerCase(Locale.ROOT));
        }

        List<String> result = new ArrayList<>(sanitized.size());
        Set<String> usedInOutput = new HashSet<>();

        for (String name : sanitized) {
            String lower = name.toLowerCase(Locale.ROOT);
            if (!usedInOutput.contains(lower)) {
                usedInOutput.add(lower);
                result.add(name);
            } else {
                String deduped = generateUniqueSuffix(name, takenCaseInsensitive, usedInOutput);
                takenCaseInsensitive.add(deduped.toLowerCase(Locale.ROOT));
                usedInOutput.add(deduped.toLowerCase(Locale.ROOT));
                result.add(deduped);
            }
        }

        return result;
    }

    private static String generateUniqueSuffix(String baseName, Set<String> allCandidates, Set<String> usedInOutput) {
        String baseWithoutExt;
        String ext;
        int lastDot = baseName.lastIndexOf('.');
        if (lastDot > 0 && lastDot < baseName.length() - 1) {
            baseWithoutExt = baseName.substring(0, lastDot);
            ext = baseName.substring(lastDot);
        } else {
            baseWithoutExt = baseName;
            ext = "";
        }

        int index = 2;
        while (true) {
            String suffix = " (" + index + ")";
            int allowedBaseLen = MAX_FILENAME_LENGTH - ext.length() - suffix.length();
            String candidateBase = (allowedBaseLen > 0 && baseWithoutExt.length() > allowedBaseLen)
                    ? baseWithoutExt.substring(0, allowedBaseLen)
                    : baseWithoutExt;

            String candidate = candidateBase + suffix + ext;
            String candidateLower = candidate.toLowerCase(Locale.ROOT);

            if (!allCandidates.contains(candidateLower) && !usedInOutput.contains(candidateLower)) {
                return candidate;
            }
            index++;
        }
    }

    private static String sanitizeBase(String raw) {
        String normalized = Normalizer.normalize(raw, Normalizer.Form.NFC);

        StringBuilder sb = new StringBuilder(normalized.length());
        for (int i = 0; i < normalized.length(); i++) {
            char c = normalized.charAt(i);
            if (c < 32 || c == 127) {
                continue;
            }
            if ("<>:\"/\\|?*".indexOf(c) >= 0) {
                sb.append('_');
            } else {
                sb.append(c);
            }
        }
        String clean = sb.toString();

        clean = clean.replace("..", "_");

        while (clean.startsWith("/") || clean.startsWith("\\")) {
            clean = clean.substring(1);
        }

        return clean.trim();
    }

    private static boolean isReservedDeviceName(String name) {
        return RESERVED_DEVICE_NAMES.matcher(name).matches();
    }

    private static String truncatePreservingExtension(String name, int maxLen) {
        if (name.length() <= maxLen) {
            return name;
        }

        int lastDot = name.lastIndexOf('.');
        if (lastDot > 0 && lastDot < name.length() - 1) {
            String ext = name.substring(lastDot);
            if (ext.length() >= maxLen) {
                return name.substring(0, maxLen);
            }
            int keepBase = maxLen - ext.length();
            return name.substring(0, keepBase) + ext;
        }

        return name.substring(0, maxLen);
    }
}
