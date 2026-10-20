package com.pastebin.shared.errors;

import org.springframework.http.HttpStatus;

public class PayloadTooLargeException extends AppException {
    public PayloadTooLargeException(String message) {
        super(HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", message);
    }
}
