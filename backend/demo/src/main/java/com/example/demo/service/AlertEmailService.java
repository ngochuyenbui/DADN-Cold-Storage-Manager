package com.example.demo.service;

import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertEmailService {

    private final JavaMailSender mailSender;
    private final UserRepository userRepository;

    @Value("${app.mail.from:}")
    private String fromEmail;

    @Value("${spring.mail.username:}")
    private String smtpUsername;

    @Value("${spring.mail.password:}")
    private String smtpPassword;

    private boolean isMailConfigured() {
        return smtpUsername != null && !smtpUsername.isBlank()
                && smtpPassword != null && !smtpPassword.isBlank();
    }

    /** Gửi cảnh báo sensor đến tất cả user có alertEmailEnabled = true */
    @Async
    public void sendAlertEmail(String alertType, String message) {
        if (!isMailConfigured()) { log.warn("[AlertEmail] Chưa cấu hình SMTP"); return; }
        List<User> recipients = userRepository.findAll().stream()
                .filter(u -> u.getEmail() != null && !u.getEmail().isBlank())
                .filter(User::isAlertEmailEnabled)
                .toList();
        for (User user : recipients) {
            sendMail(user.getEmail(), "⚠️ Cảnh báo: " + alertType, buildAlertBody(user, alertType, message));
        }
    }

    /** Gửi thông báo tự khắc phục đến tất cả user có alertEmailEnabled = true */
    @Async
    public void sendResolvedEmail(String alertType, String message) {
        if (!isMailConfigured()) return;
        List<User> recipients = userRepository.findAll().stream()
                .filter(u -> u.getEmail() != null && !u.getEmail().isBlank())
                .filter(User::isAlertEmailEnabled)
                .toList();
        for (User user : recipients) {
            sendMail(user.getEmail(), "✅ Đã khắc phục: " + alertType, buildResolvedBody(user, alertType, message));
        }
    }

    /** Gửi email tùy ý đến một địa chỉ cụ thể — dùng cho báo cáo lỗi người dùng */
    @Async
    public void sendRawEmail(String toEmail, String subject, String html) {
        if (!isMailConfigured()) { log.warn("[AlertEmail] Chưa cấu hình SMTP"); return; }
        sendMail(toEmail, subject, html);
    }

    private void sendMail(String toEmail, String subject, String html) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, false, StandardCharsets.UTF_8.name());
            if (fromEmail != null && !fromEmail.isBlank()) helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(html, true);
            mailSender.send(mime);
            log.info("[AlertEmail] Gửi '{}' đến {}", subject, toEmail);
        } catch (Exception e) {
            log.error("[AlertEmail] Gửi thất bại đến {}: {}", toEmail, e.getMessage());
        }
    }

    private String buildAlertBody(User user, String type, String message) {
        String name = fullName(user);
        return """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
              <h2 style="color:#ef4444;margin-top:0">⚠️ Cảnh báo hệ thống kho lạnh</h2>
              <p>Xin chào <b>%s</b>,</p>
              <p>Hệ thống FreshGuard vừa phát hiện sự cố:</p>
              <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin:16px 0">
                <b>Loại lỗi:</b> %s<br/><b>Chi tiết:</b> %s
              </div>
              <p>Vui lòng kiểm tra và xử lý ngay.</p>
              <p style="color:#6b7280;font-size:12px;margin-top:24px">— FreshGuard System</p>
            </div>""".formatted(name, type, message);
    }

    private String buildResolvedBody(User user, String type, String message) {
        String name = fullName(user);
        return """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
              <h2 style="color:#10b981;margin-top:0">✅ Sự cố đã được khắc phục</h2>
              <p>Xin chào <b>%s</b>,</p>
              <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin:16px 0">
                <b>Loại:</b> %s<br/><b>Chi tiết:</b> %s
              </div>
              <p>Hệ thống đã trở về trạng thái bình thường.</p>
              <p style="color:#6b7280;font-size:12px;margin-top:24px">— FreshGuard System</p>
            </div>""".formatted(name, type, message);
    }

    private String fullName(User u) {
        String n = ((u.getFirstName() != null ? u.getFirstName() : "") + " "
                + (u.getLastName() != null ? u.getLastName() : "")).trim();
        return n.isEmpty() ? u.getUsername() : n;
    }
}
