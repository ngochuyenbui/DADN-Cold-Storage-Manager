package com.example.demo.controller;

import com.example.demo.entity.User;
import com.example.demo.entity.UserIssueReport;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.repository.UserIssueReportRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.AlertEmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/issue-reports")
@RequiredArgsConstructor
public class IssueReportController {

    private final UserIssueReportRepository reportRepo;
    private final StorageRoomRepository roomRepo;
    private final UserRepository userRepo;
    private final SecurityUtils securityUtils;
    private final AlertEmailService alertEmailService;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    // ── GET: danh sách báo cáo ────────────────────────────────────────────────
    @GetMapping
    public ResponseEntity<?> list() {
        List<Map<String, Object>> result = reportRepo.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toMap).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ── POST: người dùng gửi báo cáo ─────────────────────────────────────────
    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        String title = str(body.get("title"));
        String description = str(body.get("description"));
        if (title == null || title.isBlank() || description == null || description.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "title và description là bắt buộc"));
        }

        UserIssueReport report = new UserIssueReport();
        report.setTitle(title);
        report.setDescription(description);
        report.setCategory(str(body.getOrDefault("category", "OTHER")));
        report.setStatus("OPEN");
        report.setCreatedAt(LocalDateTime.now());
        report.setReportedBy(securityUtils.currentUserId());

        if (body.get("roomId") instanceof Number n) report.setRoomId(n.intValue());

        reportRepo.save(report);

        // Gửi mail cho MAINTENANCE và ADMIN
        String reporterName = securityUtils.currentUser()
                .map(u -> (u.getFirstName() != null ? u.getFirstName() : "") + " " + (u.getLastName() != null ? u.getLastName() : ""))
                .map(String::trim).orElse("Người dùng");

        String roomName = report.getRoomId() != null
                ? roomRepo.findById(report.getRoomId()).map(r -> r.getName()).orElse("Phòng " + report.getRoomId())
                : "Không xác định";

        sendIssueEmail(report, reporterName, roomName);

        log.info("📋 Báo cáo lỗi mới #{} từ {}: {}", report.getReportId(), reporterName, title);
        return ResponseEntity.ok(toMap(report));
    }

    // ── PUT: cập nhật trạng thái (MAINTENANCE/ADMIN) ──────────────────────────
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        UserIssueReport report = reportRepo.findById(id).orElse(null);
        if (report == null) return ResponseEntity.notFound().build();

        if (body.containsKey("status")) {
            report.setStatus(str(body.get("status")));
            if ("RESOLVED".equals(report.getStatus())) {
                report.setResolvedAt(LocalDateTime.now());
                report.setResolvedBy(securityUtils.currentUserId());
            }
        }
        if (body.containsKey("note")) report.setNote(str(body.get("note")));
        reportRepo.save(report);
        return ResponseEntity.ok(toMap(report));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void sendIssueEmail(UserIssueReport report, String reporterName, String roomName) {
        List<User> recipients = userRepo.findAll().stream()
                .filter(u -> u.getEmail() != null && !u.getEmail().isBlank())
                .filter(User::isAlertEmailEnabled)
                .collect(Collectors.toList());

        String subject = "📋 Báo cáo lỗi mới: " + report.getTitle();
        String html = buildEmailHtml(report, reporterName, roomName);

        for (User user : recipients) {
            alertEmailService.sendRawEmail(user.getEmail(), subject, html);
        }
    }

    private String buildEmailHtml(UserIssueReport r, String reporter, String roomName) {
        return """
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
              <h2 style="color:#6366f1;margin-top:0">📋 Báo cáo lỗi mới từ người dùng</h2>
              <table style="width:100%%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px;color:#6b7280;width:140px">Tiêu đề</td><td style="padding:8px;font-weight:bold">%s</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Danh mục</td><td style="padding:8px">%s</td></tr>
                <tr><td style="padding:8px;color:#6b7280">Phòng</td><td style="padding:8px">%s</td></tr>
                <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Người báo cáo</td><td style="padding:8px">%s</td></tr>
                <tr><td style="padding:8px;color:#6b7280">Thời gian</td><td style="padding:8px">%s</td></tr>
              </table>
              <div style="margin-top:16px;padding:12px;background:#f3f4f6;border-radius:6px">
                <p style="margin:0;color:#374151;font-size:14px"><b>Mô tả:</b></p>
                <p style="margin:8px 0 0;color:#4b5563">%s</p>
              </div>
              <p style="margin-top:20px;color:#6b7280;font-size:12px">Vui lòng xử lý sớm. — FreshGuard System</p>
            </div>
            """.formatted(
                esc(r.getTitle()), esc(r.getCategory()), esc(roomName), esc(reporter),
                r.getCreatedAt().format(DT_FMT), esc(r.getDescription()));
    }

    private Map<String, Object> toMap(UserIssueReport r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reportId",    r.getReportId());
        m.put("title",       r.getTitle());
        m.put("description", r.getDescription());
        m.put("category",    r.getCategory());
        m.put("roomId",      r.getRoomId());
        m.put("roomName",    r.getRoomId() != null
                ? roomRepo.findById(r.getRoomId()).map(room -> room.getName()).orElse("—") : "—");
        m.put("status",      r.getStatus());
        m.put("createdAt",   r.getCreatedAt() != null ? r.getCreatedAt().format(DT_FMT) : null);
        m.put("resolvedAt",  r.getResolvedAt() != null ? r.getResolvedAt().format(DT_FMT) : null);
        m.put("note",        r.getNote());
        // Tên người báo cáo
        String reporter = r.getReportedBy() != null
                ? userRepo.findById(r.getReportedBy())
                    .map(u -> ((u.getFirstName() != null ? u.getFirstName() : "") + " " + (u.getLastName() != null ? u.getLastName() : "")).trim())
                    .orElse("—") : "—";
        m.put("reportedBy", reporter);
        return m;
    }

    private String str(Object o) { return o == null ? null : o.toString().trim(); }
    private String esc(String s) {
        if (s == null) return "";
        return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;");
    }
}
