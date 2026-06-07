package com.example.demo.controller;

import com.example.demo.entity.SensorDevice;
import com.example.demo.entity.MonitorDevice;
import com.example.demo.repository.SensorDeviceRepository;
import com.example.demo.repository.MonitorDeviceRepository;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.repository.StorageZoneRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/sensors")
@RequiredArgsConstructor
public class SensorDeviceController {

    private final SensorDeviceRepository sensorRepo;
    private final MonitorDeviceRepository monitorRepo;
    private final StorageRoomRepository roomRepo;
    private final StorageZoneRepository zoneRepo;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) Integer roomId) {
        if (roomId != null) return ResponseEntity.ok(sensorRepo.findByRoomId(roomId));
        return ResponseEntity.ok(sensorRepo.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable Integer id) {
        return sensorRepo.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        SensorDevice sensor = new SensorDevice();
        sensor.setName((String) body.get("name"));
        sensor.setConnectKey(body.getOrDefault("connectKey", "key-" + System.currentTimeMillis()).toString());
        sensor.setStatus(body.getOrDefault("status", "offline").toString());
        if (body.containsKey("roomId")) sensor.setRoomId((Integer) body.get("roomId"));
        sensor.setInstallDate(LocalDate.now());
        sensorRepo.save(sensor);

        userLogService.log(securityUtils.currentUserId(), "CREATE_SENSOR",
                "Thêm cảm biến: " + sensor.getName());
        return ResponseEntity.ok(sensor);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        SensorDevice sensor = sensorRepo.findById(id).orElse(null);
        if (sensor == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name"))       sensor.setName((String) body.get("name"));
        if (body.containsKey("status"))     sensor.setStatus((String) body.get("status"));
        if (body.containsKey("connectKey")) sensor.setConnectKey((String) body.get("connectKey"));
        if (body.containsKey("roomId"))     sensor.setRoomId((Integer) body.get("roomId"));
        sensorRepo.save(sensor);

        userLogService.log(securityUtils.currentUserId(), "UPDATE_SENSOR",
                "Cập nhật cảm biến: " + sensor.getName());
        return ResponseEntity.ok(sensor);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        SensorDevice sensor = sensorRepo.findById(id).orElse(null);
        if (sensor == null) return ResponseEntity.notFound().build();

        String name = sensor.getName();
        sensorRepo.deleteById(id);

        userLogService.log(securityUtils.currentUserId(), "DELETE_SENSOR",
                "Xóa cảm biến: " + name);
        return ResponseEntity.ok(Map.of("message", "Đã xóa cảm biến"));
    }

    /**
     * POST /api/sensors/seed-all
     * Tự động tạo đủ 4 loại cảm biến cho TẤT CẢ phòng nếu chưa có:
     * - Cảm biến nhiệt độ/độ ẩm (connect_key: sensor-data)
     * - Cảm biến ánh sáng (connect_key: sensor-light)
     * - Cảm biến chuyển động (connect_key: sensor-motion)
     */
    @PostMapping("/seed-all")
    public ResponseEntity<?> seedAll() {
        var rooms = roomRepo.findAll();
        int totalCreated = 0;

        for (var room : rooms) {
            int roomId = room.getRoomId();
            var existing = sensorRepo.findByRoomId(roomId);

            boolean hasTempHumi = existing.stream().anyMatch(s ->
                "sensor-data".equals(s.getConnectKey()) ||
                (s.getName() != null && s.getName().toLowerCase().contains("nhiệt")));
            boolean hasLight = existing.stream().anyMatch(s ->
                "sensor-light".equals(s.getConnectKey()) ||
                (s.getName() != null && s.getName().toLowerCase().contains("ánh sáng")));
            boolean hasMotion = existing.stream().anyMatch(s ->
                "sensor-motion".equals(s.getConnectKey()) ||
                (s.getName() != null && s.getName().toLowerCase().contains("chuyển động")));

            // Tính mã phòng: A1, B1, C1...
            String roomCode = resolveRoomCode(roomId);

            if (!hasTempHumi) {
                SensorDevice s = new SensorDevice();
                s.setName("Cảm biến nhiệt độ " + roomCode);
                s.setConnectKey("sensor-data");
                s.setStatus("offline");
                s.setRoomId(roomId);
                s.setInstallDate(java.time.LocalDate.now());
                sensorRepo.save(s);
                totalCreated++;
            }
            if (!hasLight) {
                SensorDevice s = new SensorDevice();
                s.setName("Cảm biến ánh sáng " + roomCode);
                s.setConnectKey("sensor-light");
                s.setStatus("offline");
                s.setRoomId(roomId);
                s.setInstallDate(java.time.LocalDate.now());
                sensorRepo.save(s);
                totalCreated++;
            }
            if (!hasMotion) {
                SensorDevice s = new SensorDevice();
                s.setName("Cảm biến chuyển động " + roomCode);
                s.setConnectKey("sensor-motion");
                s.setStatus("offline");
                s.setRoomId(roomId);
                s.setInstallDate(java.time.LocalDate.now());
                sensorRepo.save(s);
                totalCreated++;
            }
        }

        userLogService.log(securityUtils.currentUserId(), "SEED_SENSORS",
                "Seed cảm biến cho " + rooms.size() + " phòng, tạo " + totalCreated + " cảm biến mới");

        // Seed đèn cho các phòng chưa có
        int lightCreated = 0;
        for (var room : rooms) {
            int roomId = room.getRoomId();
            String roomCode = resolveRoomCode(roomId);
            boolean hasLight = monitorRepo.findByRoomId(roomId).stream()
                .anyMatch(m -> "light".equals(m.getConnectKey()) ||
                    (m.getName() != null && m.getName().toLowerCase().contains("đèn")));
            if (!hasLight) {
                MonitorDevice d = new MonitorDevice();
                d.setName("Đèn " + roomCode);
                d.setConnectKey("light");
                d.setStatus("offline");
                d.setMode("MANUAL");
                d.setRoomId(roomId);
                d.setDeviceCategory("LIGHT");
                d.setInstallDate(java.time.LocalDate.now());
                monitorRepo.save(d);
                lightCreated++;
            }
        }

        return ResponseEntity.ok(Map.of(
                "rooms", rooms.size(),
                "sensorsCreated", totalCreated,
                "lightsCreated", lightCreated,
                "message", "Đã seed " + totalCreated + " cảm biến và " + lightCreated + " đèn cho " + rooms.size() + " phòng"
        ));
    }

    private String resolveRoomCode(int roomId) {
        try {
            var zones = zoneRepo.findAll();
            for (var zone : zones) {
                var rooms = roomRepo.findByAreaId(zone.getAreaId());
                rooms.sort(java.util.Comparator.comparing(com.example.demo.entity.StorageRoom::getRoomId));
                for (int i = 0; i < rooms.size(); i++) {
                    if (rooms.get(i).getRoomId() == roomId) {
                        String areaName = zone.getAreaName() != null ? zone.getAreaName().toUpperCase() : "";
                        String letter = "X";
                        java.util.regex.Matcher m = java.util.regex.Pattern.compile("KHU\\s+([A-Z])").matcher(areaName);
                        if (m.find()) letter = m.group(1);
                        return letter + (i + 1);
                    }
                }
            }
        } catch (Exception ignored) {}
        return "R" + roomId;
    }
}
