package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.pastebin.paste.domain.Visibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = false)
public record CreateEncryptedPasteRequest(
        @NotEmpty(message = "At least one encrypted file payload is required")
        @Size(max = 20, message = "Maximum of 20 files allowed per paste")
        List<@Valid EncryptedFilePayload> files,

        @NotNull(message = "Encryption mode is required")
        @Pattern(regexp = "^(LINK|PASSPHRASE)$", message = "Encryption mode must be LINK or PASSPHRASE")
        String encryptionMode,

        @NotNull(message = "KDF salt is required")
        @Size(min = 16, max = 16, message = "KDF salt must be exactly 16 bytes")
        byte[] kdfSalt,

        @Min(value = 600000, message = "KDF iterations must be at least 600,000")
        @Max(value = 2000000, message = "KDF iterations must not exceed 2,000,000")
        int kdfIterations,

        @Size(min = 60, max = 60, message = "Wrapped key must be exactly 60 bytes when present")
        byte[] wrappedKey,

        Instant expiresAt,

        Visibility visibility,

        @Size(max = 50, message = "Language hint must not exceed 50 characters")
        String languageHint,

        boolean burnAfterReading,

        String website
) {
    @Override
    public String toString() {
        return "CreateEncryptedPasteRequest[filesCount=" + (files != null ? files.size() : 0)
                + ", mode=" + encryptionMode
                + ", kdfIterations=" + kdfIterations
                + ", wrappedKey=" + (wrappedKey != null ? "[REDACTED " + wrappedKey.length + " bytes]" : "null")
                + ", burnAfterReading=" + burnAfterReading + "]";
    }
}
