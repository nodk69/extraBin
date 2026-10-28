package com.pastebin.notification.application;

import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserRepository;
import com.pastebin.notification.api.dto.NotificationPreferenceResponse;
import com.pastebin.notification.api.dto.UpdateNotificationPreferencesRequest;
import com.pastebin.shared.errors.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationPreferenceService {
    private final UserRepository users;
    public NotificationPreferenceService(UserRepository users) { this.users = users; }

    @Transactional(readOnly = true)
    public NotificationPreferenceResponse get(Long userId) {
        User user = find(userId);
        return new NotificationPreferenceResponse(user.isNotifyOnReplies(), user.isNotifyOnFollows());
    }

    @Transactional
    public NotificationPreferenceResponse update(Long userId, UpdateNotificationPreferencesRequest request) {
        User user = find(userId);
        user.setNotifyOnReplies(request.notifyOnReplies());
        user.setNotifyOnFollows(request.notifyOnFollows());
        return new NotificationPreferenceResponse(user.isNotifyOnReplies(), user.isNotifyOnFollows());
    }

    private User find(Long id) {
        return users.findById(id).orElseThrow(() -> new ResourceNotFoundException("Account not found."));
    }
}
