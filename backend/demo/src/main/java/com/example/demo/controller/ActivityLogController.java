package com.example.demo.controller;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.entity.User;
import com.example.demo.entity.UserLog;
import com.example.demo.repository.UserLogRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.SecurityUtils;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class ActivityLogController {

    private final UserLogRepository userLogRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;

    /**
     * GET /api/logs?page=0&size=50&userId=...&typeAction=LOGIN
     * Trả về danh sách log có phân trang, kèm thông tin user.
     */
    @GetMapping
    public ResponseEntity<?> getLogs(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false)    String userId,
            @RequestParam(required = false)    List<String> typeAction) {

        UUID uid = null;
        if (userId != null && !userId.isBlank()) {
            try { uid = UUID.fromString(userId); } catch (Exception ignored) {}
        }

        List<String> typeActions = new ArrayList<>();
        if (typeAction != null) {
            for (String action : typeAction) {
                if (action != null && !action.isBlank()) {
                    typeActions.add(action.trim());
                }
            }
        }

        boolean excludeAdmin = securityUtils.currentUser()
            .map(User::getRole)
            .map(r -> r != null && !"ADMIN".equalsIgnoreCase(r.getRoleName()))
            .orElse(true);

        UUID currentUserId = securityUtils.currentUserId();
        boolean restrictAuthToSelf = excludeAdmin && currentUserId != null;

        Page<UserLog> result = userLogRepository.findFiltered(
            uid,
            typeActions.isEmpty() ? List.of("__NONE__") : typeActions,
            typeActions.isEmpty(),
            excludeAdmin,
            restrictAuthToSelf,
            currentUserId,
            PageRequest.of(page, size)
        );

        var items = result.getContent().stream().map(log -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("logId",      log.getLogId());
            m.put("typeAction", log.getTypeAction());
            m.put("description", log.getDescription());
            m.put("timestamp",  log.getTimestamp());
            // Enrich với thông tin user
            UUID logUserId = log.getUserId();
            if (logUserId != null) {
                userRepository.findById(logUserId).ifPresentOrElse(u -> {
                    m.put("userId",    u.getUserId().toString());
                    m.put("username",  u.getUsername());
                    m.put("fullName",  (u.getFirstName() != null ? u.getFirstName() : "") + " "
                                     + (u.getLastName()  != null ? u.getLastName()  : ""));
                    m.put("role",      u.getRole() != null ? u.getRole().getRoleName() : "");
                }, () -> {
                    m.put("userId",   logUserId.toString());
                    m.put("username", "unknown");
                    m.put("fullName", "");
                    m.put("role",     "");
                });
            }
            return m;
        }).toList();

        return ResponseEntity.ok(Map.of(
                "content",       items,
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages(),
                "page",          page
        ));
    }
}
