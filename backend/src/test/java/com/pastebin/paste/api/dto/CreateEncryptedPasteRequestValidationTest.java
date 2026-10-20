package com.pastebin.paste.api.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CreateEncryptedPasteRequestValidationTest {

    private static Validator validator;
    private static ObjectMapper objectMapper;

    @BeforeAll
    static void setUp() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
        objectMapper = new ObjectMapper().findAndRegisterModules();
    }

    private EncryptedFilePayload createValidFile() {
        return new EncryptedFilePayload(
                "notes.txt",
                new byte[12], // 12-byte nonce
                new byte[]{1, 2, 3, 4}, // ciphertext
                new byte[16] // 16-byte auth tag
        );
    }

    @Test
    void validRequest_passesValidation() {
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[16],
                600000,
                new byte[60],
                Instant.now().plusSeconds(3600),
                null,
                "markdown",
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).isEmpty();
    }

    @Test
    void emptyFiles_failsValidation() {
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                Collections.emptyList(),
                "LINK",
                new byte[16],
                600000,
                new byte[60],
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("files"));
    }

    @Test
    void invalidEncryptionMode_failsValidation() {
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "INVALID_MODE",
                new byte[16],
                600000,
                null,
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("encryptionMode"));
    }

    @Test
    void invalidSaltLength_failsValidation() {
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[8], // Salt must be 16 bytes
                600000,
                new byte[60],
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("kdfSalt"));
    }

    @Test
    void kdfIterationsBelowMinimum_failsValidation() {
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[16],
                100000, // Below 600,000
                new byte[60],
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("kdfIterations"));
    }

    @Test
    void kdfIterationsAboveMaximum_failsValidation() {
        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[16],
                2500000, // Above 2,000,000
                new byte[60],
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("kdfIterations"));
    }

    @Test
    void invalidNonceLength_failsValidation() {
        EncryptedFilePayload invalidFile = new EncryptedFilePayload(
                "test.txt",
                new byte[8], // Invalid: must be 12 bytes
                new byte[]{1, 2},
                new byte[16]
        );

        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(invalidFile),
                "LINK",
                new byte[16],
                600000,
                new byte[60],
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().contains("nonce"));
    }

    @Test
    void invalidAuthTagLength_failsValidation() {
        EncryptedFilePayload invalidFile = new EncryptedFilePayload(
                "test.txt",
                new byte[12],
                new byte[]{1, 2},
                new byte[12] // Invalid: must be 16 bytes
        );

        CreateEncryptedPasteRequest req = new CreateEncryptedPasteRequest(
                List.of(invalidFile),
                "LINK",
                new byte[16],
                600000,
                new byte[60],
                null,
                null,
                null,
                false,
                null
        );

        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations = validator.validate(req);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().contains("authTag"));
    }

    @Test
    void unknownProperty_rejectedDuringDeserialization() {
        String jsonWithUnknown = """
                {
                    "files": [
                        {
                            "filenameHint": "test.txt",
                            "nonce": "AAAAAAAAAAAAAAAA",
                            "ciphertext": "AQIDBA==",
                            "authTag": "AAAAAAAAAAAAAAAAAAAAAA=="
                        }
                    ],
                    "encryptionMode": "LINK",
                    "kdfSalt": "AAAAAAAAAAAAAAAAAAAAAA==",
                    "kdfIterations": 600000,
                    "wrappedKey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                    "unexpectedField": "maliciousPayload"
                }
                """;

        assertThatThrownBy(() -> objectMapper.readValue(jsonWithUnknown, CreateEncryptedPasteRequest.class))
                .isInstanceOf(UnrecognizedPropertyException.class);
    }

    @Test
    void wrappedKey_mustBeExactly60Bytes_whenPresent() {
        // 59 bytes -> invalid
        CreateEncryptedPasteRequest req59 = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[16],
                600000,
                new byte[59],
                null,
                null,
                null,
                false,
                null
        );
        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations59 = validator.validate(req59);
        assertThat(violations59).anyMatch(v -> v.getPropertyPath().toString().equals("wrappedKey"));

        // 61 bytes -> invalid
        CreateEncryptedPasteRequest req61 = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[16],
                600000,
                new byte[61],
                null,
                null,
                null,
                false,
                null
        );
        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violations61 = validator.validate(req61);
        assertThat(violations61).anyMatch(v -> v.getPropertyPath().toString().equals("wrappedKey"));

        // Exactly 60 bytes with non-zero nonce -> valid
        byte[] validWrappedKey = new byte[60];
        validWrappedKey[0] = 1; // non-zero nonce byte
        CreateEncryptedPasteRequest reqValid = new CreateEncryptedPasteRequest(
                List.of(createValidFile()),
                "LINK",
                new byte[16],
                600000,
                validWrappedKey,
                null,
                null,
                null,
                false,
                null
        );
        Set<ConstraintViolation<CreateEncryptedPasteRequest>> violationsValid = validator.validate(reqValid);
        assertThat(violationsValid).isEmpty();
    }
}
