package com.example.demo.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/settings/notifications")
@RequiredArgsConstructor
public class NotificationSettingsController {

    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;
    private final UserLogService userLogService;

    @GetMapping
    public ResponseEntity<?> getCurrentUserSettings() {
        User user = securityUtils.currentUser().orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Phiên đăng nhập không hợp lệ"));
        }

        return ResponseEntity.ok(Map.of(
                "alertEmailEnabled", user.isAlertEmailEnabled(),
                "alertPushEnabled", user.isAlertPushEnabled()
        ));
    }

    @PutMapping
    public ResponseEntity<?> updateCurrentUserSettings(@RequestBody Map<String, Boolean> body) {
        User user = securityUtils.currentUser().orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Phiên đăng nhập không hợp lệ"));
        }

        if (body.containsKey("alertEmailEnabled") && body.get("alertEmailEnabled") != null) {
            user.setAlertEmailEnabled(body.get("alertEmailEnabled"));
        }
        if (body.containsKey("alertPushEnabled") && body.get("alertPushEnabled") != null) {
            user.setAlertPushEnabled(body.get("alertPushEnabled"));
        }

        userRepository.save(user);

        userLogService.log(user.getUserId(), "UPDATE_NOTIFICATION_SETTINGS",
                "Cập nhật cài đặt thông báo: email=" + user.isAlertEmailEnabled()
                        + ", push=" + user.isAlertPushEnabled());

        return ResponseEntity.ok(Map.of(
                "alertEmailEnabled", user.isAlertEmailEnabled(),
                "alertPushEnabled", user.isAlertPushEnabled(),
                "message", "Đã cập nhật cài đặt thông báo"
        ));
    }
}
