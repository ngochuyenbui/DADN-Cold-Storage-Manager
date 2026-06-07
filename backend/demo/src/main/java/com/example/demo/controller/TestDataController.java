package com.example.demo.controller;

import com.example.demo.mqtt.AdafruitMqttService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Endpoint test — inject sensor data trực tiếp vào hệ thống
 * mà không cần gửi qua Adafruit MQTT
 * POST /api/test/sensor-data
 * Body: { "payload": "A1:t=25,h=60" }
 */
@RestController
@RequestMapping("/api/test")
@RequiredArgsConstructor
public class TestDataController {

    private final AdafruitMqttService mqttService;

    @PostMapping("/sensor-data")
    public ResponseEntity<?> injectSensorData(@RequestBody Map<String, Object> body) {
        String payload = body.getOrDefault("payload", "").toString().trim();
        if (payload.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "payload is required, e.g. A1:t=25,h=60"));
        }
        try {
            mqttService.simulateSensorData(payload);
            return ResponseEntity.ok(Map.of("message", "Injected: " + payload));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** GET /api/test/inject?payload=A1:t=25,h=60 — dùng thẳng trên trình duyệt */
    @GetMapping("/inject")
    public ResponseEntity<?> injectGet(@RequestParam String payload) {
        try {
            mqttService.simulateSensorData(payload);
            return ResponseEntity.ok(Map.of("message", "Injected: " + payload));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** GET /api/test/inject-sample — inject 20 điểm mẫu cho A1 và B1 */
    @GetMapping("/inject-sample")
    public ResponseEntity<?> injectSample() {
        String[] samples = {
            "A1:t=20,h=55","A1:t=22,h=57","A1:t=25,h=60","A1:t=28,h=62","A1:t=30,h=65",
            "A1:t=27,h=63","A1:t=24,h=58","A1:t=21,h=54","A1:t=19,h=52","A1:t=23,h=56",
            "B1:t=3,h=70","B1:t=4,h=72","B1:t=5,h=75","B1:t=3.5,h=71","B1:t=4.5,h=73",
            "B1:t=6,h=78","B1:t=5.5,h=76","B1:t=4,h=72","B1:t=3,h=69","B1:t=5,h=74"
        };
        for (String p : samples) {
            try { mqttService.simulateSensorData(p); } catch (Exception ignored) {}
        }
        return ResponseEntity.ok(Map.of("message", "Injected " + samples.length + " sample points"));
    }
}
