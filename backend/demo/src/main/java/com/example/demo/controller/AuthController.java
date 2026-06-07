package com.example.demo.controller;

import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.JwtUtil;
import com.example.demo.service.PasswordResetEmailService;
import com.example.demo.service.UserLogService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final Pattern PASSWORD_DIGIT_PATTERN = Pattern.compile(".*\\d.*");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^\\S+@\\S+\\.\\S+$");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final UserLogService userLogService;
    private final PasswordResetEmailService passwordResetEmailService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");

        User user = userRepository.findByUsername(username).orElse(null);

        if (user == null || !passwordEncoder.matches(password, user.getPassword())) {
            return ResponseEntity.status(401).body(Map.of("error", "Sai tên đăng nhập hoặc mật khẩu"));
        }

        String role = user.getRole() != null ? user.getRole().getRoleName() : "STAFF";
        String token = jwtUtil.generate(username, role);

        userLogService.log(user.getUserId(), "LOGIN", "Đăng nhập thành công — vai trò: " + role);

        return ResponseEntity.ok(Map.of(
                "token", token,
                "username", user.getUsername(),
                "role", role,
                "firstName", user.getFirstName() != null ? user.getFirstName() : "",
                "lastName", user.getLastName() != null ? user.getLastName() : "",
            "email", user.getEmail() != null ? user.getEmail() : "",
                "mustChangePassword", user.isMustChangePassword()
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.substring(7);
        String username = jwtUtil.getUsername(token);
        userRepository.findByUsername(username).ifPresent(u ->
                userLogService.log(u.getUserId(), "LOGOUT", "Đăng xuất"));
        return ResponseEntity.ok(Map.of("message", "Đã đăng xuất"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.substring(7);
        String username = jwtUtil.getUsername(token);
        User user = userRepository.findByUsername(username).orElseThrow();
        String role = user.getRole() != null ? user.getRole().getRoleName() : "STAFF";
        return ResponseEntity.ok(Map.of(
                "username", user.getUsername(),
                "role", role,
                "firstName", user.getFirstName() != null ? user.getFirstName() : "",
                "lastName", user.getLastName() != null ? user.getLastName() : "",
                "email", user.getEmail() != null ? user.getEmail() : "",
                "mustChangePassword", user.isMustChangePassword()
        ));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMe(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody Map<String, String> body) {
        String token = authHeader.substring(7);
        String username = jwtUtil.getUsername(token);
        User user = userRepository.findByUsername(username).orElse(null);
        if (user == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Không tìm thấy người dùng"));
        }

        if (body.containsKey("firstName")) {
            String firstName = body.get("firstName");
            if (firstName == null || firstName.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Họ không được để trống"));
            }
            user.setFirstName(firstName.trim());
        }

        if (body.containsKey("lastName")) {
            String lastName = body.get("lastName");
            if (lastName == null || lastName.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Tên không được để trống"));
            }
            user.setLastName(lastName.trim());
        }

        if (body.containsKey("email")) {
            String email = body.get("email");
            if (email == null || email.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Email là bắt buộc"));
            }
            if (!EMAIL_PATTERN.matcher(email.trim()).matches()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Email không đúng định dạng"));
            }

            Optional<User> existing = userRepository.findByEmailIgnoreCase(email.trim());
            if (existing.isPresent() && !existing.get().getUserId().equals(user.getUserId())) {
                return ResponseEntity.badRequest().body(Map.of("error", "Email đã tồn tại"));
            }

            user.setEmail(email.trim());
        }

        userRepository.save(user);
        userLogService.log(user.getUserId(), "UPDATE_PROFILE",
                "Cập nhật hồ sơ tài khoản: " + user.getFirstName() + " " + user.getLastName()
                        + ", email=" + (user.getEmail() != null ? user.getEmail() : ""));

        String role = user.getRole() != null ? user.getRole().getRoleName() : "STAFF";
        return ResponseEntity.ok(Map.of(
                "username", user.getUsername(),
                "role", role,
                "firstName", user.getFirstName() != null ? user.getFirstName() : "",
                "lastName", user.getLastName() != null ? user.getLastName() : "",
                "email", user.getEmail() != null ? user.getEmail() : "",
                "mustChangePassword", user.isMustChangePassword(),
                "message", "Đã cập nhật email tài khoản"
        ));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email là bắt buộc"));
        }
        if (!EMAIL_PATTERN.matcher(email.trim()).matches()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email không đúng định dạng"));
        }

        Optional<User> found = userRepository.findByEmailIgnoreCase(email.trim());
        if (found.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Email không tồn tại trong hệ thống, vui lòng kiểm tra lại"));
        }

        User user = found.get();
        String resetToken = jwtUtil.generatePasswordResetToken(user.getUsername(), user.getEmail());
        PasswordResetEmailService.SendResult result = passwordResetEmailService.sendPasswordResetEmail(
                user.getEmail(), user.getUsername(), resetToken);

        if (!result.sent()) {
            if (result.message().startsWith("Vui long cho ")) {
                return ResponseEntity.status(429).body(Map.of("error", result.message()));
            }
            return ResponseEntity.status(500).body(Map.of("error", result.message()));
        }

        return ResponseEntity.ok(Map.of("message", result.message()));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, String> body) {
        String token = body.get("token");
        String newPassword = body.get("newPassword");
        String currentPassword = body.get("currentPassword");

        if (newPassword == null || newPassword.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Mật khẩu mới là bắt buộc"));
        }
        if (newPassword.trim().length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("error", "Mật khẩu mới phải dài ít nhất 8 ký tự"));
        }
        if (!PASSWORD_DIGIT_PATTERN.matcher(newPassword).matches()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Mật khẩu mới phải có ít nhất 1 chữ số"));
        }

        User user;
        if (token != null && !token.isBlank()) {
            if (!jwtUtil.isValid(token) || !jwtUtil.isResetPasswordToken(token)) {
                return ResponseEntity.status(400).body(Map.of("error", "Link đổi mật khẩu không hợp lệ hoặc đã hết hạn"));
            }

            String username = jwtUtil.getUsername(token);
            String email = jwtUtil.getEmail(token);

            user = userRepository.findByUsername(username).orElse(null);
            if (user == null || user.getEmail() == null || !user.getEmail().equals(email)) {
                return ResponseEntity.status(400).body(Map.of("error", "Link đổi mật khẩu không hợp lệ"));
            }
        } else {
            if (authHeader == null || authHeader.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Thiếu token đăng nhập"));
            }
            String bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
            if (!jwtUtil.isValid(bearerToken)) {
                return ResponseEntity.status(401).body(Map.of("error", "Phiên đăng nhập không hợp lệ"));
            }

            String username = jwtUtil.getUsername(bearerToken);
            user = userRepository.findByUsername(username).orElse(null);
            if (user == null) {
                return ResponseEntity.status(404).body(Map.of("error", "Không tìm thấy người dùng"));
            }
            if (currentPassword == null || currentPassword.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Mật khẩu hiện tại là bắt buộc"));
            }
            if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
                return ResponseEntity.status(400).body(Map.of("error", "Mật khẩu hiện tại không đúng"));
            }
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setMustChangePassword(false);
        userRepository.save(user);

        userLogService.log(user.getUserId(), "CHANGE_PASSWORD", "Đổi mật khẩu");

        return ResponseEntity.ok(Map.of("message", "Đổi mật khẩu thành công"));
    }
}
