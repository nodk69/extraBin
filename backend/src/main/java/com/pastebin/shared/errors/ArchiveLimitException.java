package com.pastebin.shared.errors;

import org.springframework.http.HttpStatus;

public class ArchiveLimitException extends AppException {
    public ArchiveLimitException(String message) {
        super(HttpStatus.PAYLOAD_TOO_LARGE, "ARCHIVE_TOO_LARGE", message);
    }
}
