package com.pastebin.shared.errors;

import org.springframework.http.HttpStatus;

public class ConflictException extends AppException {
    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", message);
    }
}
