package com.pastebin.identity.api;

import com.pastebin.identity.api.dto.*;
import com.pastebin.identity.application.AuthService;
import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.shared.errors.UnauthorizedException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "Endpoints for registration, login, logout, and password recovery")
public class AuthController {

    private final AuthService authService;
    private final com.pastebin.shared.security.ClientIpResolver clientIpResolver;

    public AuthController(AuthService authService, com.pastebin.shared.security.ClientIpResolver clientIpResolver) {
        this.authService = authService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/supabase-signup")
    @Operation(summary = "Register user account via Supabase", description = "Provisions user in Supabase and syncs locally.")
    public ResponseEntity<Map<String, String>> supabaseSignUp(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest
    ) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        authService.supabaseSignUp(request, clientIp);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("message", "User registered successfully with Supabase."));
    }

    @PostMapping("/supabase-sync")
    @Operation(summary = "Sync Supabase authenticated session", description = "Validates Supabase token, ensures user exists locally, and establishes session.")
    public ResponseEntity<UserResponse> supabaseSync(
            @Valid @RequestBody SupabaseSyncRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        UserResponse response = authService.syncSupabaseUser(
                request.accessToken(),
                httpRequest,
                httpResponse
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    @Operation(summary = "Register user account", description = "Registers a new user with BCrypt password hashing.")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest
    ) {
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        UserResponse response = authService.register(request, clientIp);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    @Operation(summary = "Log in with session cookie", description = "Authenticates user and establishes secure HttpOnly session.")
    public ResponseEntity<UserResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        UserResponse response = authService.login(request, httpRequest, httpResponse);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    @Operation(summary = "Log out user", description = "Invalidates session cookie and clears security context.")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        authService.logout(httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    @Operation(summary = "Get current authenticated user profile", description = "Returns active user information if authenticated.")
    public ResponseEntity<UserResponse> getCurrentUser(@AuthenticationPrincipal Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            UserResponse response = authService.getCurrentUser(userPrincipal.getId());
            return ResponseEntity.ok(response);
        }
        throw new UnauthorizedException("Authentication required");
    }

    @PutMapping("/me/profile")
    @Operation(summary = "Update current user's public profile", description = "Replaces display name, bio, avatar, and social links for the authenticated user.")
    public ResponseEntity<UserResponse> updateProfile(
            @AuthenticationPrincipal Object principal,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            UserResponse response = authService.updateProfile(userPrincipal.getId(), request);
            return ResponseEntity.ok(response);
        }
        throw new UnauthorizedException("Authentication required");
    }

    @PostMapping("/password-reset/request")
    @Operation(summary = "Request password reset", description = "Sends single-use token; always returns generic 200 response to avoid enumeration.")
    public ResponseEntity<Map<String, String>> requestPasswordReset(
            @Valid @RequestBody PasswordResetRequest request,
            HttpServletRequest httpRequest
    ) {
        // P1-03: must go through the shared hardened resolver (a raw getRemoteAddr()
        // behind ForwardedHeaderFilter is the attacker-controlled XFF[0] value).
        String clientIp = clientIpResolver.resolveClientIp(httpRequest);
        String message = authService.requestPasswordReset(request, clientIp);
        return ResponseEntity.ok(Map.of("message", message));
    }

    @PostMapping("/password-reset/confirm")
    @Operation(summary = "Confirm password reset", description = "Resets user password with valid cryptographic token.")
    public ResponseEntity<Map<String, String>> confirmPasswordReset(@Valid @RequestBody PasswordResetConfirmRequest request) {
        authService.confirmPasswordReset(request);
        return ResponseEntity.ok(Map.of("message", "Password has been successfully updated."));
    }
}
