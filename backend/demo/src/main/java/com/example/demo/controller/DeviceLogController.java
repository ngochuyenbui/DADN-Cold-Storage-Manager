package com.example.demo.controller;

import com.example.demo.entity.DeviceLog;
import com.example.demo.entity.MonitorDevice;
import com.example.demo.entity.SensorDevice;
import com.example.demo.repository.DeviceLogRepository;
import com.example.demo.repository.MonitorDeviceRepository;
import com.example.demo.repository.SensorDeviceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * GET /api/device-logs?deviceId=1&page=0&size=30
 * GET /api/device-logs?typeAction=COMMAND&page=0&size=30
 * GET /api/device-logs?page=0&size=30  (tất cả)
 * Quyền: ADMIN, STAFF, MAINTENANCE đều xem được
 */
@RestController
@RequestMapping("/api/device-logs")
@RequiredArgsConstructor
public class DeviceLogController {

    private final DeviceLogRepository deviceLogRepository;
    private final SensorDeviceRepository sensorDeviceRepository;
    private final MonitorDeviceRepository monitorDeviceRepository;

    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(required = false) Integer deviceId,
            @RequestParam(required = false) String typeAction,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "30") int size) {

        PageRequest pageable = PageRequest.of(page, size, Sort.by("timestamp").descending());

        Page<DeviceLog> result;
        if (deviceId != null) {
            result = deviceLogRepository.findByDeviceIdOrderByTimestampDesc(deviceId, pageable);
        } else if (typeAction != null && !typeAction.isBlank()) {
            result = deviceLogRepository.findByTypeActionOrderByTimestampDesc(typeAction, pageable);
        } else {
            result = deviceLogRepository.findAllByOrderByTimestampDesc(pageable);
        }

        var items = result.getContent().stream().map(log -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("logId",      log.getDlogId());
            m.put("deviceId",   log.getDeviceId());
            m.put("typeAction", log.getTypeAction());
            m.put("description", log.getDescription());
            m.put("timestamp",  log.getTimestamp());
            // Enrich tên thiết bị
            m.put("deviceName", resolveDeviceName(log.getDeviceId(), log.getTypeAction()));
            return m;
        }).toList();

        return ResponseEntity.ok(Map.of(
            "content",       items,
            "totalElements", result.getTotalElements(),
            "totalPages",    result.getTotalPages(),
            "page",          page
        ));
    }

    private String resolveDeviceName(Integer deviceId, String typeAction) {
        if (deviceId == null) return "Hệ thống";
        if ("COMMAND".equals(typeAction)) {
            return monitorDeviceRepository.findById(deviceId)
                .map(MonitorDevice::getName)
                .orElse("Thiết bị #" + deviceId);
        }
        return sensorDeviceRepository.findById(deviceId)
            .map(SensorDevice::getName)
            .orElse("Cảm biến #" + deviceId);
    }
}
