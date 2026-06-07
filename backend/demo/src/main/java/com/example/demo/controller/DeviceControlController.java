package com.example.demo.controller;

import com.example.demo.mqtt.AdafruitMqttService;
import com.example.demo.repository.SensorDeviceRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.AlertService;
import com.example.demo.service.UserLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/control")
@RequiredArgsConstructor
@Slf4j
public class DeviceControlController {

    private final AdafruitMqttService mqttService;
    private final SensorDeviceRepository sensorDeviceRepository;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;
    private final AlertService alertService;

    @PostMapping("/fan-control")
    public ResponseEntity<?> setFanControl(@RequestBody Map<String, Object> body) {
        int roomId  = body.containsKey("roomId")  ? (int) body.get("roomId")  : 1;
        int tempFan = body.containsKey("tempFan") ? (int) body.get("tempFan") : 0;
        int humiFan = body.containsKey("humiFan") ? (int) body.get("humiFan") : 0;
        mqttService.publishFanControl(roomId, tempFan, humiFan);
        userLogService.log(securityUtils.currentUserId(), "CONTROL",
            "Quạt phòng " + roomId + " → nhiệt: " + (tempFan == 1 ? "BẬT" : "TẮT")
            + ", ẩm: " + (humiFan == 1 ? "BẬT" : "TẮT"));
        return ResponseEntity.ok(Map.of("feed", "fan-control",
            "value", "r" + roomId + ":t=" + tempFan + ",h=" + humiFan));
    }

    /** Endpoint mới: publish lên feed device-control với format A1:t=0,h=0,l=1 */
    @PostMapping("/device-control")
    public ResponseEntity<?> setDeviceControl(@RequestBody Map<String, Object> body) {
        int roomId  = body.containsKey("roomId")  ? ((Number) body.get("roomId")).intValue()  : 1;
        int tempFan = body.containsKey("tempFan") ? ((Number) body.get("tempFan")).intValue() : 0;
        int humiFan = body.containsKey("humiFan") ? ((Number) body.get("humiFan")).intValue() : 0;
        int light   = body.containsKey("light")   ? ((Number) body.get("light")).intValue()   : 0;

        // Tính roomCode (A1, B1...) từ roomId
        String roomCode = mqttService.resolveRoomCode(roomId);
        StringBuilder value = new StringBuilder(roomCode + ":t=" + tempFan + ",h=" + humiFan);
        value.append(",l=").append(light);

        mqttService.publish("device-control", value.toString());
        userLogService.log(securityUtils.currentUserId(), "CONTROL",
            "Device control phòng " + roomId + " → " + value);
        return ResponseEntity.ok(Map.of("feed", "device-control", "value", value.toString()));
    }

    @PostMapping("/threshold")
    public ResponseEntity<?> setThreshold(@RequestBody Map<String, Object> body) {
        int roomId = body.containsKey("roomId") ? (int) body.get("roomId") : 1;
        double temp = Double.parseDouble(body.getOrDefault("temp", 35).toString());
        double humi = Double.parseDouble(body.getOrDefault("humi", 60).toString());

        mqttService.publishThreshold(roomId, temp, humi);
        userLogService.log(securityUtils.currentUserId(), "SET_THRESHOLD",
            "Ngưỡng phòng " + roomId + " → " + (int) temp + "°C, " + (int) humi + "%");

        // Kiểm tra ngay với sensor hiện tại trong DB
        final double t = temp, h = humi;
        var sensors = sensorDeviceRepository.findByRoomId(roomId);
        log.info("threshold check: roomId={} sensors={} t={} h={}", roomId, sensors.size(), t, h);
        sensors.stream().findFirst().ifPresent(s -> {
            double curT = s.getTemperature() != null ? s.getTemperature() : 0;
            double curH = s.getHumidity()    != null ? s.getHumidity()    : 0;
            log.info("sensor in DB: temp={} humi={}", curT, curH);
            alertService.checkAndAlert(roomId, curT, curH, t, h);
        });

        return ResponseEntity.ok(Map.of("feed", "threshold",
            "value", "r" + roomId + ":t=" + (int) temp + ",h=" + (int) humi));
    }

    @PostMapping("/mode")
    public ResponseEntity<?> setMode(@RequestBody Map<String, Object> body) {
        String value = body.get("value").toString();
        int roomId = body.containsKey("roomId")
            ? ((Number) body.get("roomId")).intValue()
            : 1;
        String roomCode = mqttService.resolveRoomCode(roomId);
        String mqttValue = roomCode + ":" + value;
        mqttService.publish("mode", mqttValue);
        if (!"2".equals(value)) {
            mqttService.publishDisabledScheduleForRoom(roomId);
        }
        String label = switch (value) {
            case "1" -> "TỰ ĐỘNG";
            case "2" -> "LỊCH TRÌNH";
            default  -> "THỦ CÔNG";
        };
        userLogService.log(securityUtils.currentUserId(), "CONTROL", "Chế độ → " + label);
        return ResponseEntity.ok(Map.of("feed", "mode", "value", mqttValue));
    }

    @GetMapping("/sensor-status")
    public ResponseEntity<?> getSensorStatus() {
        return ResponseEntity.ok(sensorDeviceRepository.findAll());
    }

    @GetMapping("/mqtt-status")
    public ResponseEntity<?> mqttStatus() {
        return ResponseEntity.ok(Map.of(
            "connected", mqttService.isConnected(),
            "message", mqttService.isConnected() ? "MQTT đang kết nối" : "MQTT chưa kết nối"
        ));
    }
}
