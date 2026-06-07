package com.example.demo.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

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
public class CredentialEmailService {

    public record SendResult(boolean sent, String message) {}

    private final JavaMailSender mailSender;

    @Value("${app.mail.from:}")
    private String fromEmail;

    @Value("${spring.mail.username:}")
    private String smtpUsername;

    @Value("${spring.mail.password:}")
    private String smtpPassword;

    @Value("${app.frontend.base-url:http://localhost:3000}")
    private String frontendBaseUrl;

    @Value("${app.frontend.login-path:/login}")
    private String loginPath;

    @Value("${app.frontend.change-password-path:/forgot-password}")
    private String changePasswordPath;

    public SendResult sendNewUserCredentials(String toEmail, String username, String rawPassword, String roleName,
            String firstName, String lastName) {
        if (smtpUsername == null || smtpUsername.isBlank() || smtpPassword == null || smtpPassword.isBlank()) {
            String msg = "Email chua duoc cau hinh (thieu SPRING_MAIL_USERNAME hoac SPRING_MAIL_PASSWORD)";
            log.warn("{}", msg);
            return new SendResult(false, msg);
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED, StandardCharsets.UTF_8.name());
            if (fromEmail != null && !fromEmail.isBlank()) {
                helper.setFrom(Objects.requireNonNull(fromEmail));
            }
            helper.setTo(Objects.requireNonNull(toEmail));
            helper.setSubject("Thong tin dang nhap he thong FreshGuard");
            helper.setText(Objects.requireNonNull(buildHtmlBody(toEmail, username, rawPassword, roleName, firstName, lastName)), true);
            mailSender.send(message);
            return new SendResult(true, "Da gui email thong tin dang nhap");
        } catch (MailAuthenticationException ex) {
            String msg = "Xac thuc SMTP that bai. Kiem tra SPRING_MAIL_USERNAME/PASSWORD (Gmail can App Password)";
            log.error("{}", msg);
            return new SendResult(false, msg);
        } catch (MessagingException | IOException ex) {
            String msg = "Khong the tao email HTML: " + ex.getMessage();
            log.error("{}", msg);
            return new SendResult(false, msg);
        } catch (MailException ex) {
            String msg = "Khong the gui email thong tin dang nhap: " + ex.getMessage();
            log.error("{}", msg);
            return new SendResult(false, msg);
        }
    }

    private String buildHtmlBody(String email, String username, String rawPassword, String roleName,
            String firstName, String lastName) throws IOException {
        String template = new String(new ClassPathResource("email/new-user-registration.html").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        return template
                .replace("${email}", safe(email))
                .replace("${password}", safe(rawPassword))
                .replace("${firstName}", safe(firstName))
                .replace("${lastName}", safe(lastName))
                .replace("${username}", safe(username))
                .replace("${role}", safe(roleName))
                .replace("${loginUrl}", safe(buildUrl(frontendBaseUrl, loginPath)))
                .replace("${changePasswordUrl}", safe(buildUrl(frontendBaseUrl, changePasswordPath)));
    }

    private String buildUrl(String base, String path) {
        String normalizedBase = (base == null || base.isBlank()) ? "http://localhost:3000" : base.trim();
        String normalizedPath = (path == null || path.isBlank()) ? "/" : path.trim();

        if (normalizedBase.endsWith("/") && normalizedPath.startsWith("/")) {
            return normalizedBase.substring(0, normalizedBase.length() - 1) + normalizedPath;
        }
        if (!normalizedBase.endsWith("/") && !normalizedPath.startsWith("/")) {
            return normalizedBase + "/" + normalizedPath;
        }
        return normalizedBase + normalizedPath;
    }

    private String safe(String value) {
        return value == null ? "" : escapeHtml(value);
    }

    private String escapeHtml(String input) {
        return input
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
