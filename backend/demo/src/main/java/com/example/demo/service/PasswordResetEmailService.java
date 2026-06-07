package com.example.demo.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetEmailService {

    public record SendResult(boolean sent, String message) {}

    private final JavaMailSender mailSender;
    private final ConcurrentHashMap<String, Long> lastSentAtByEmail = new ConcurrentHashMap<>();

    private static final long RESEND_COOLDOWN_MILLIS = 60_000L;

    @Value("${app.mail.from:}")
    private String fromEmail;

    @Value("${spring.mail.username:}")
    private String smtpUsername;

    @Value("${spring.mail.password:}")
    private String smtpPassword;

    @Value("${app.frontend.base-url:http://localhost:3000}")
    private String frontendBaseUrl;

    @Value("${app.frontend.change-password-path:/change-password}")
    private String changePasswordPath;

    public SendResult sendPasswordResetEmail(String toEmail, String username, String token) {
        if (smtpUsername == null || smtpUsername.isBlank() || smtpPassword == null || smtpPassword.isBlank()) {
            String msg = "Email chưa được cấu hình (thiếu SPRING_MAIL_USERNAME hoặc SPRING_MAIL_PASSWORD)";
            log.warn("{}", msg);
            return new SendResult(false, msg);
        }

                String normalizedEmail = normalizeEmail(toEmail);
                long now = System.currentTimeMillis();
                Long lastSentAt = lastSentAtByEmail.get(normalizedEmail);
                if (lastSentAt != null && now - lastSentAt < RESEND_COOLDOWN_MILLIS) {
                        long remainingSeconds = Math.max(1L, (RESEND_COOLDOWN_MILLIS - (now - lastSentAt) + 999L) / 1000L);
                        String msg = "Vui lòng chờ " + remainingSeconds + " giây trước khi gửi lại email này";
                        log.warn("{}: {}", msg, normalizedEmail);
                        return new SendResult(false, msg);
                }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            if (fromEmail != null && !fromEmail.isBlank()) {
                                helper.setFrom(Objects.requireNonNull(fromEmail));
            }
            helper.setTo(Objects.requireNonNull(toEmail));
                        helper.setSubject("FreshGuard - Đặt lại mật khẩu");

            String resetUrl = buildResetUrl(token);
            helper.setText(Objects.requireNonNull(buildHtmlBody(username, resetUrl)), true);
            mailSender.send(message);
                        lastSentAtByEmail.put(normalizedEmail, now);
            return new SendResult(true, "Đã gửi email đặt lại mật khẩu");
        } catch (MailAuthenticationException ex) {
            String msg = "Xác thực SMTP thất bại. Kiểm tra SPRING_MAIL_USERNAME/PASSWORD";
            log.error("{}", msg);
            return new SendResult(false, msg);
        } catch (MessagingException | MailException ex) {
            String msg = "Không thể gửi email đặt lại mật khẩu: " + ex.getMessage();
            log.error("{}", msg);
            return new SendResult(false, msg);
        }
    }

    private String buildResetUrl(String token) {
        String base = normalizeBase(frontendBaseUrl);
        String path = normalizePath(changePasswordPath);
        String separator = path.contains("?") ? "&" : "?";
        return base + path + separator + "token=" + token;
    }

    private String normalizeBase(String base) {
        if (base == null || base.isBlank()) {
            return "http://localhost:3000";
        }
        String value = base.trim();
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String normalizePath(String path) {
        if (path == null || path.isBlank()) {
            return "/change-password";
        }
        String value = path.trim();
        return value.startsWith("/") ? value : "/" + value;
    }

    private String buildHtmlBody(String username, String resetUrl) {
        String safeUsername = escapeHtml(username);
        String safeUrl = escapeHtml(resetUrl);
        try {
            String template = new String(
                    new ClassPathResource("email/password-reset.html").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
            return template
                    .replace("${username}", safeUsername)
                    .replace("${url}", safeUrl);
        } catch (IOException ex) {
            throw new IllegalStateException("Không thể đọc template email đặt lại mật khẩu", ex);
        }
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private String escapeHtml(String input) {
        if (input == null) {
            return "";
        }
        return input
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
