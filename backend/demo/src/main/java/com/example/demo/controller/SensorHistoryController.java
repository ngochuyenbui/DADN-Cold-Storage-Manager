package com.example.demo.controller;

import com.example.demo.entity.DeviceLog;
import com.example.demo.repository.DeviceLogRepository;
import com.example.demo.repository.SensorDeviceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/sensor-history")
@RequiredArgsConstructor
public class SensorHistoryController {

    private final DeviceLogRepository deviceLogRepository;
    private final SensorDeviceRepository sensorDeviceRepository;

    // GET /api/sensor-history/temp?hours=24&roomId=1
    // GET /api/sensor-history/humi?hours=6&roomId=1
    @GetMapping("/{feed}")
    public List<Map<String, Object>> getHistory(
            @PathVariable String feed,
            @RequestParam(defaultValue = "24") int hours,
            @RequestParam(required = false) Integer roomId) {

        String typeAction = switch (feed.toLowerCase()) {
            case "temp"   -> "SENSOR_TEMP";
            case "humi"   -> "SENSOR_HUMI";
            case "light"  -> "SENSOR_LIGHT";
            case "motion" -> "SENSOR_MOTION";
            default       -> "SENSOR_TEMP";
        };
        LocalDateTime from = LocalDateTime.now().minusHours(hours);

        List<DeviceLog> logs = deviceLogRepository.findSensorHistory(typeAction, from);

        // Nếu có roomId, lọc theo deviceId thuộc phòng đó
        if (roomId != null) {
            Set<Integer> deviceIds = sensorDeviceRepository.findByRoomId(roomId)
                    .stream().map(s -> s.getDeviceId()).collect(java.util.stream.Collectors.toSet());
            // Nếu không có sensor nào trong phòng, fallback lấy log có deviceId = roomId (legacy)
            if (!deviceIds.isEmpty()) {
                logs = logs.stream()
                        .filter(l -> deviceIds.contains(l.getDeviceId()))
                        .collect(java.util.stream.Collectors.toList());
            }
        }

        return logs.stream().map(log -> Map.<String, Object>of(
            "value", parseValue(log.getDescription()),
            "recordedAt", log.getTimestamp().toString()
        )).collect(java.util.stream.Collectors.toList());
    }

    private double parseValue(String description) {
        try {
            return Double.parseDouble(description);
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }
}
