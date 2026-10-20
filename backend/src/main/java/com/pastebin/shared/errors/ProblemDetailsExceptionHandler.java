package com.pastebin.shared.errors;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class ProblemDetailsExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ProblemDetailsExceptionHandler.class);

    @ExceptionHandler(AppException.class)
    public ResponseEntity<ProblemDetail> handleAppException(AppException ex, HttpServletRequest request) {
        log.warn("Application exception: [{}] {}", ex.getErrorCode(), ex.getMessage());

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        problem.setTitle(ex.getStatus().getReasonPhrase());
        problem.setType(URI.create("https://pastebin.local/errors/" + ex.getErrorCode().toLowerCase()));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", ex.getErrorCode());
        problem.setProperty("timestamp", Instant.now().toString());

        HttpHeaders headers = new HttpHeaders();
        if (ex instanceof RateLimitExceededException rateLimitEx) {
            headers.set("Retry-After", String.valueOf(rateLimitEx.getRetryAfterSeconds()));
        }

        if (ex.getStatus() == HttpStatus.NOT_FOUND || request.getRequestURI().startsWith("/api/v1/pastes")) {
            headers.set(HttpHeaders.CACHE_CONTROL, "no-store, no-cache, must-revalidate");
            headers.set(HttpHeaders.VARY, "X-Share-Token, X-Paste-Password, X-Paste-Unlock, Cookie");
        }

        return new ResponseEntity<>(problem, headers, ex.getStatus());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidationException(MethodArgumentNotValidException ex, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed for request parameters");
        problem.setTitle("Validation Failed");
        problem.setType(URI.create("https://pastebin.local/errors/validation-failed"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "VALIDATION_FAILED");
        problem.setProperty("timestamp", Instant.now().toString());

        List<Map<String, String>> invalidParams = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            Map<String, String> param = new HashMap<>();
            param.put("field", fieldError.getField());
            param.put("reason", fieldError.getDefaultMessage());
            invalidParams.add(param);
        }
        problem.setProperty("invalidParams", invalidParams);

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(problem);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleUnreadableBody(HttpMessageNotReadableException ex, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Malformed JSON request body");
        problem.setTitle("Malformed Request");
        problem.setType(URI.create("https://pastebin.local/errors/malformed-request"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "MALFORMED_REQUEST");
        problem.setProperty("timestamp", Instant.now().toString());

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(problem);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ProblemDetail> handleMaxUploadSize(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, "Uploaded payload exceeds permitted maximum size");
        problem.setTitle("Payload Too Large");
        problem.setType(URI.create("https://pastebin.local/errors/payload-too-large"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "PAYLOAD_TOO_LARGE");
        problem.setProperty("timestamp", Instant.now().toString());

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(problem);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access is denied to the requested resource");
        problem.setTitle("Access Denied");
        problem.setType(URI.create("https://pastebin.local/errors/access-denied"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "ACCESS_DENIED");
        problem.setProperty("timestamp", Instant.now().toString());

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(problem);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ProblemDetail> handleAuthenticationException(AuthenticationException ex, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Authentication is required to access this resource");
        problem.setTitle("Unauthorized");
        problem.setType(URI.create("https://pastebin.local/errors/unauthorized"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "UNAUTHORIZED");
        problem.setProperty("timestamp", Instant.now().toString());

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(problem);
    }

    /**
     * P1-16: a lost version update (concurrent edit raced a save) previously fell through
     * to the generic 500 handler, which both loses the client's retry semantics and logs
     * a full stack trace for an expected, benign condition. Map it to 409 so optimistic
     * concurrency failures surface as retriable conflicts.
     */
    @ExceptionHandler(org.springframework.orm.ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ProblemDetail> handleOptimisticLocking(
            org.springframework.orm.ObjectOptimisticLockingFailureException ex, HttpServletRequest request) {
        log.warn("Optimistic locking conflict processing request [{}]: {}", request.getRequestURI(), ex.getMessage());

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, "The resource was modified concurrently. Reload and retry.");
        problem.setTitle("Conflict");
        problem.setType(URI.create("https://pastebin.local/errors/optimistic-lock-conflict"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "OPTIMISTIC_LOCK_CONFLICT");
        problem.setProperty("timestamp", Instant.now().toString());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
    }

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<ProblemDetail> handleNoResourceFound(
            org.springframework.web.servlet.resource.NoResourceFoundException ex, HttpServletRequest request) {
        log.warn("No resource found for request [{}]: {}", request.getRequestURI(), ex.getMessage());

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND, "The requested resource was not found.");
        problem.setTitle("Not Found");
        problem.setType(URI.create("https://pastebin.local/errors/resource-not-found"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "RESOURCE_NOT_FOUND");
        problem.setProperty("timestamp", Instant.now().toString());

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Robots-Tag", "noindex, nofollow");
        return new ResponseEntity<>(problem, headers, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGenericException(Exception ex, HttpServletRequest request) {
        // Redact internal exception message in the response to prevent info leakage
        log.error("Unhandled internal server error processing request [{}]: ", request.getRequestURI(), ex);

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "An internal server error occurred. Please try again later.");
        problem.setTitle("Internal Server Error");
        problem.setType(URI.create("https://pastebin.local/errors/internal-server-error"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "INTERNAL_SERVER_ERROR");
        problem.setProperty("timestamp", Instant.now().toString());

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problem);
    }
}
