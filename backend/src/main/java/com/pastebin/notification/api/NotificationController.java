package com.pastebin.notification.api;

import com.pastebin.identity.infrastructure.PastebinUserPrincipal;
import com.pastebin.notification.api.dto.NotificationResponse;
import com.pastebin.notification.api.dto.NotificationPreferenceResponse;
import com.pastebin.notification.api.dto.UpdateNotificationPreferencesRequest;
import com.pastebin.notification.application.NotificationPreferenceService;
import com.pastebin.notification.application.NotificationService;
import com.pastebin.shared.errors.UnauthorizedException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@Tag(name = "Notifications", description = "Endpoints for user reply notifications")
public class NotificationController {

    private final NotificationService notificationService;
    private final NotificationPreferenceService preferenceService;

    public NotificationController(NotificationService notificationService, NotificationPreferenceService preferenceService) {
        this.notificationService = notificationService;
        this.preferenceService = preferenceService;
    }

    @GetMapping({"/api/v1/notifications", "/api/notifications"})
    @Operation(summary = "Get user notifications", description = "Returns recent notifications for authenticated user.")
    public ResponseEntity<List<NotificationResponse>> getNotifications(
            @RequestParam(value = "limit", required = false, defaultValue = "20") int limit,
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        if (userId == null) {
            throw new UnauthorizedException("Authentication required.");
        }
        return ResponseEntity.ok(notificationService.getNotifications(userId, limit));
    }

    @GetMapping({"/api/v1/notifications/unread-count", "/api/notifications/unread-count"})
    @Operation(summary = "Get unread notifications count", description = "Returns count of unread notifications.")
    public ResponseEntity<Map<String, Long>> getUnreadCount(
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        if (userId == null) {
            return ResponseEntity.ok(Map.of("unreadCount", 0L));
        }
        return ResponseEntity.ok(Map.of("unreadCount", notificationService.getUnreadCount(userId)));
    }

    @PostMapping("/api/v1/notifications/{notificationId}/read")
    public ResponseEntity<Void> markAsRead(@PathVariable Long notificationId, @AuthenticationPrincipal Object principal) {
        if (!notificationService.markAsRead(requireUserId(principal), notificationId)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping({"/api/v1/notifications/mark-read", "/api/notifications/mark-read"})
    @Operation(summary = "Mark all notifications read", description = "Marks all unread notifications as read.")
    public ResponseEntity<Void> markAllAsRead(
            @AuthenticationPrincipal Object principal
    ) {
        Long userId = extractUserId(principal);
        if (userId == null) {
            throw new UnauthorizedException("Authentication required.");
        }
        notificationService.markAllAsRead(userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/notifications/preferences")
    public ResponseEntity<NotificationPreferenceResponse> getPreferences(@AuthenticationPrincipal Object principal) {
        return ResponseEntity.ok(preferenceService.get(requireUserId(principal)));
    }

    @PutMapping("/api/v1/notifications/preferences")
    public ResponseEntity<NotificationPreferenceResponse> updatePreferences(
            @AuthenticationPrincipal Object principal, @jakarta.validation.Valid @RequestBody UpdateNotificationPreferencesRequest request) {
        return ResponseEntity.ok(preferenceService.update(requireUserId(principal), request));
    }

    private Long requireUserId(Object principal) {
        Long userId = extractUserId(principal);
        if (userId == null) throw new UnauthorizedException("Authentication required.");
        return userId;
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof PastebinUserPrincipal userPrincipal) {
            return userPrincipal.getId();
        }
        return null;
    }
}
