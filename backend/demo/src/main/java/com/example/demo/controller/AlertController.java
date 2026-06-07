package com.example.demo.controller;

import com.example.demo.entity.Alert;
import com.example.demo.repository.AlertRepository;
import com.example.demo.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertRepository alertRepository;
    private final AlertService alertService;

    /** GET /api/alerts?status=ACTIVE&size=50 */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(defaultValue = "50") int size) {

        List<Alert> alerts = status.equals("ALL")
            ? alertRepository.findAll(PageRequest.of(0, size,
                org.springframework.data.domain.Sort.by("time").descending())).getContent()
            : alertRepository.findByStatusOrderByTimeDesc(status).stream().limit(size).toList();

        return ResponseEntity.ok(alerts);
    }

    /** GET /api/alerts/count — số alert ACTIVE (dùng cho badge) */
    @GetMapping("/count")
    public ResponseEntity<?> count() {
        long count = alertRepository.findByStatusOrderByTimeDesc("ACTIVE").size();
        return ResponseEntity.ok(Map.of("count", count));
    }

    /** GET /api/alerts/count-by-room — đếm alert ACTIVE theo từng phòng */
    @GetMapping("/count-by-room")
    public ResponseEntity<?> countByRoom() {
        Map<Integer, Long> result = alertRepository.findByStatusOrderByTimeDesc("ACTIVE")
            .stream()
            .filter(a -> a.getRoomId() != null)
            .collect(java.util.stream.Collectors.groupingBy(
                Alert::getRoomId, java.util.stream.Collectors.counting()));
        return ResponseEntity.ok(result);
    }

    /** PUT /api/alerts/{id}/resolve — đánh dấu đã xử lý */
    @PutMapping("/{id}/resolve")
    public ResponseEntity<?> resolve(@PathVariable Integer id) {
        alertService.resolve(id);
        return ResponseEntity.ok(Map.of("message", "Đã xử lý cảnh báo"));
    }

    /** PUT /api/alerts/resolve-all — xử lý tất cả */
    @PutMapping("/resolve-all")
    public ResponseEntity<?> resolveAll() {
        alertRepository.findByStatusOrderByTimeDesc("ACTIVE").forEach(a -> alertService.resolve(a.getAlertId()));
        return ResponseEntity.ok(Map.of("message", "Đã xử lý tất cả cảnh báo"));
    }
}
