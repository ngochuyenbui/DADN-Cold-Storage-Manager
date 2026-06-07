package com.example.demo.controller;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.entity.Role;
import com.example.demo.entity.RolePermission;
import com.example.demo.repository.RolePermissionRepository;
import com.example.demo.repository.RoleRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/admin/roles")
@RequiredArgsConstructor
public class AdminRolePermissionController {

    private final RoleRepository roleRepository;
    private final RolePermissionRepository rolePermissionRepository;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;

    private static final List<Map<String, String>> PERMISSION_CATALOG = List.of(
        Map.of("key", "USER_MANAGE", "label", "Quản lý người dùng", "group", "Quản trị"),
        Map.of("key", "ROLE_PERMISSION_MANAGE", "label", "Phân quyền theo role", "group", "Quản trị"),
        Map.of("key", "ZONE_MANAGE", "label", "Quản lý khu vực", "group", "Vận hành"),
        Map.of("key", "ROOM_MANAGE", "label", "Quản lý phòng", "group", "Vận hành"),
        Map.of("key", "SENSOR_MANAGE", "label", "Quản lý cảm biến", "group", "Thiết bị"),
        Map.of("key", "DEVICE_MANAGE", "label", "Quản lý thiết bị điều khiển", "group", "Thiết bị"),
        Map.of("key", "CONTROL_DEVICE", "label", "Điều khiển thiết bị", "group", "Thiết bị"),
        Map.of("key", "THRESHOLD_SET", "label", "Thiết lập ngưỡng", "group", "Thiết bị"),
        Map.of("key", "ALERT_VIEW", "label", "Xem cảnh báo", "group", "Giám sát"),
        Map.of("key", "LOG_VIEW", "label", "Xem nhật ký", "group", "Giám sát"),
        Map.of("key", "REPORT_VIEW", "label", "Xem báo cáo", "group", "Giám sát")
    );

    @GetMapping("/permissions")
    public ResponseEntity<?> getRolePermissions() {
        List<Role> roles = roleRepository.findAll().stream()
            .sorted(Comparator.comparing(Role::getRoleName))
            .toList();

        List<Map<String, Object>> roleDtos = roles.stream().map(role -> {
            List<String> saved = rolePermissionRepository.findByRoleOrderByPermissionKey(role)
                .stream()
                .map(RolePermission::getPermissionKey)
                .distinct()
                .toList();

            List<String> permissions = saved.isEmpty()
                ? defaultPermissionsForRole(role.getRoleName())
                : saved;

            return Map.of(
                "roleName", role.getRoleName(),
                "permissions", permissions
            );
        }).collect(Collectors.toList());

        return ResponseEntity.ok(Map.of(
            "permissionCatalog", PERMISSION_CATALOG,
            "roles", roleDtos
        ));
    }

    @PutMapping("/{roleName}/permissions")
    public ResponseEntity<?> updateRolePermissions(
        @PathVariable String roleName,
        @RequestBody Map<String, Object> body
    ) {
        Role role = roleRepository.findByRoleName(roleName)
            .orElseThrow(() -> new RuntimeException("Role không tồn tại: " + roleName));

        Object raw = body.get("permissions");
        if (!(raw instanceof List<?> list)) {
            return ResponseEntity.badRequest().body(Map.of("error", "permissions phải là mảng"));
        }

        Set<String> allowedKeys = PERMISSION_CATALOG.stream()
            .map(x -> x.get("key"))
            .collect(Collectors.toSet());

        List<String> permissions = list.stream()
            .filter(Objects::nonNull)
            .map(Object::toString)
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .distinct()
            .toList();

        List<String> invalid = permissions.stream()
            .filter(p -> !allowedKeys.contains(p))
            .toList();
        if (!invalid.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "Có permission không hợp lệ",
                "invalid", invalid
            ));
        }

        rolePermissionRepository.deleteByRole(role);
        for (String key : permissions) {
            RolePermission rp = new RolePermission();
            rp.setRole(role);
            rp.setPermissionKey(key);
            rolePermissionRepository.save(rp);
        }

        userLogService.log(
            securityUtils.currentUserId(),
            "UPDATE_ROLE_PERMISSION",
            "Cập nhật phân quyền role " + roleName + " (" + permissions.size() + " quyền)"
        );

        return ResponseEntity.ok(Map.of(
            "roleName", roleName,
            "permissions", permissions
        ));
    }

    private List<String> defaultPermissionsForRole(String roleName) {
        return switch (roleName) {
            case "ADMIN" -> PERMISSION_CATALOG.stream().map(x -> x.get("key")).toList();
            case "STAFF" -> List.of(
                "ZONE_MANAGE", "ROOM_MANAGE", "CONTROL_DEVICE", "THRESHOLD_SET",
                "ALERT_VIEW", "LOG_VIEW", "REPORT_VIEW"
            );
            case "MAINTENANCE" -> List.of(
                "CONTROL_DEVICE", "THRESHOLD_SET", "ALERT_VIEW"
            );
            default -> List.of();
        };
    }
}
