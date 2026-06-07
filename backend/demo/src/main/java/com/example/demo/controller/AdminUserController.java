package com.example.demo.controller;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.entity.Role;
import com.example.demo.entity.User;
import com.example.demo.repository.RoleRepository;
import com.example.demo.repository.UserLogRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.CredentialEmailService;
import com.example.demo.service.UserLogService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[^0-9].{7,}$");
    private static final Pattern PASSWORD_DIGIT_PATTERN = Pattern.compile(".*\\d.*");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^\\S+@\\S+\\.\\S+$");

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserLogRepository userLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserLogService userLogService;
    private final CredentialEmailService credentialEmailService;
    private final SecurityUtils securityUtils;

    @GetMapping
    public ResponseEntity<?> listUsers() {
        List<User> users = userRepository.findAll().stream()
                .sorted((a, b) -> a.getUsername().compareToIgnoreCase(b.getUsername()))
                .toList();
        return ResponseEntity.ok(users.stream().map(this::toDto).collect(Collectors.toList()));
    }

    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody Map<String, String> body) {
        String username = normalize(body.get("username"));
        String rawPassword = normalize(body.get("password"));
        String roleName = normalizeRole(body.get("role"));
        String email = normalize(body.get("email"));

        String validationError = validateUsername(username);
        if (validationError != null) return ResponseEntity.badRequest().body(Map.of("error", validationError));

        validationError = validatePassword(rawPassword);
        if (validationError != null) return ResponseEntity.badRequest().body(Map.of("error", validationError));

        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email la bat buoc de gui thong tin dang nhap"));
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email khong dung dinh dang"));
        }
        if (roleName == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Role khong hop le"));
        }

        if (userRepository.existsByUsername(username)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username da ton tai"));
        }
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email da ton tai"));
        }

        Role role = roleRepository.findByRoleName(roleName).orElse(null);
        if (role == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Role khong hop le: " + roleName));
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        user.setFirstName(body.getOrDefault("firstName", ""));
        user.setLastName(body.getOrDefault("lastName", ""));
        user.setEmail(email);
        user.setMustChangePassword(true);
        user.setRole(role);
        userRepository.save(user);

        CredentialEmailService.SendResult emailResult =
            credentialEmailService.sendNewUserCredentials(
                email,
                username,
                rawPassword,
                roleName,
                user.getFirstName(),
                user.getLastName()
            );

        userLogService.log(
            securityUtils.currentUserId(),
            "CREATE_USER",
            "Tao tai khoan @" + username + " vai tro: " + roleName
                + (emailResult.sent()
                    ? " (da gui email thong tin dang nhap)"
                    : " (gui email that bai: " + emailResult.message() + ")")
        );

        return ResponseEntity.ok(Map.of(
            "user", toDto(user),
            "emailSent", emailResult.sent(),
            "emailMessage", emailResult.message(),
            "message", emailResult.sent()
                ? "Tao user thanh cong va da gui thong tin dang nhap qua email"
                : "Tao user thanh cong nhung chua gui duoc email"
        ));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateUser(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        UUID userId = Objects.requireNonNull(id);
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        if (body.containsKey("firstName")) user.setFirstName(body.get("firstName"));
        if (body.containsKey("lastName")) user.setLastName(body.get("lastName"));
        if (body.containsKey("email")) {
            String email = normalize(body.get("email"));
            if (email != null && !email.isBlank() && !EMAIL_PATTERN.matcher(email).matches()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Email khong dung dinh dang"));
            }
            user.setEmail(email);
        }
        if (body.containsKey("password") && !Objects.toString(body.get("password"), "").isBlank()) {
            String validationError = validatePassword(normalize(body.get("password")));
            if (validationError != null) return ResponseEntity.badRequest().body(Map.of("error", validationError));
            user.setPassword(passwordEncoder.encode(body.get("password")));
        }
        if (body.containsKey("role")) {
            String roleName = normalizeRole(body.get("role"));
            if (roleName == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Role khong hop le"));
            }

            Role role = roleRepository.findByRoleName(roleName).orElse(null);
            if (role == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Role khong hop le: " + roleName));
            }
            user.setRole(role);
        }

        userRepository.save(user);

        userLogService.log(
            securityUtils.currentUserId(),
            "UPDATE_USER",
            "Cap nhat tai khoan @" + user.getUsername()
        );

        return ResponseEntity.ok(toDto(user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable UUID id) {
        UUID userId = Objects.requireNonNull(id);
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        String username = user.getUsername();
        userLogRepository.deleteByUserId(userId);
        userRepository.deleteById(userId);

        userLogService.log(securityUtils.currentUserId(), "DELETE_USER", "Xoa tai khoan @" + username);

        return ResponseEntity.ok(Map.of("message", "Da xoa user"));
    }

    private Map<String, Object> toDto(User user) {
        return Map.of(
                "userId", user.getUserId().toString(),
                "username", user.getUsername(),
                "firstName", user.getFirstName() != null ? user.getFirstName() : "",
                "lastName", user.getLastName() != null ? user.getLastName() : "",
                "email", user.getEmail() != null ? user.getEmail() : "",
                "role", user.getRole() != null ? user.getRole().getRoleName() : ""
        );
    }

    private String validateUsername(String username) {
        if (username == null || username.isBlank()) {
            return "Username la bat buoc";
        }
        String value = username.trim();
        if (!USERNAME_PATTERN.matcher(value).matches()) {
            return "Username phai dai it nhat 8 ky tu va ky tu dau tien khong duoc la so";
        }
        return null;
    }

    private String validatePassword(String password) {
        if (password == null || password.isBlank()) {
            return "Mat khau la bat buoc";
        }
        if (password.trim().length() < 8) {
            return "Mat khau phai dai it nhat 8 ky tu";
        }
        if (!PASSWORD_DIGIT_PATTERN.matcher(password).matches()) {
            return "Mat khau phai co it nhat 1 chu so";
        }
        return null;
    }

    private String normalize(String value) {
        return value == null ? null : value.trim();
    }

    private String normalizeRole(String value) {
        String normalized = normalize(value);
        return normalized == null || normalized.isBlank() ? null : normalized.toUpperCase();
    }
}
