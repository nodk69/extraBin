package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = false)
public record EncryptedFilePayload(
        @Size(max = 255, message = "Filename hint must not exceed 255 characters")
        String filenameHint,

        @NotNull(message = "Nonce is required")
        @Size(min = 12, max = 12, message = "Nonce must be exactly 12 bytes")
        byte[] nonce,

        @NotNull(message = "Ciphertext is required")
        @Size(min = 1, max = 1048576, message = "Ciphertext must be between 1 byte and 1 MiB")
        byte[] ciphertext,

        @NotNull(message = "Auth tag is required")
        @Size(min = 16, max = 16, message = "Auth tag must be exactly 16 bytes")
        byte[] authTag
) {
    @Override
    public String toString() {
        return "EncryptedFilePayload[filenameHint=" + filenameHint
                + ", ciphertextBytes=" + (ciphertext != null ? ciphertext.length : 0)
                + ", nonceBytes=" + (nonce != null ? nonce.length : 0)
                + ", authTagBytes=" + (authTag != null ? authTag.length : 0) + "]";
    }
}
