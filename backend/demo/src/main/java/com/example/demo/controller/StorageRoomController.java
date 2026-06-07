package com.example.demo.controller;

import com.example.demo.entity.StorageRoom;
import com.example.demo.entity.SensorDevice;
import com.example.demo.entity.MonitorDevice;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.repository.StorageZoneRepository;
import com.example.demo.repository.SensorDeviceRepository;
import com.example.demo.repository.MonitorDeviceRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class StorageRoomController {

    private final StorageRoomRepository roomRepo;
    private final StorageZoneRepository zoneRepo;
    private final SensorDeviceRepository sensorRepo;
    private final MonitorDeviceRepository monitorRepo;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;
    private final EntityManager em;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) Integer areaId) {
        if (areaId != null) {
            return ResponseEntity.ok(roomRepo.findByAreaId(areaId));
        }
        return ResponseEntity.ok(roomRepo.findAll());
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        Integer areaId = intValue(body.get("areaId"));
        if (areaId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "areaId is required"));
        }
        if (!zoneRepo.existsById(areaId)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Area not found"));
        }

        StorageRoom room = new StorageRoom();
        room.setName((String) body.get("name"));
        room.setAreaId(areaId);
        room.setMaxVolume(toDouble(body.get("maxVolume"), 0d));
        room.setCurrentVolume(toDouble(body.get("currentVolume"), 0d));

        if (room.getCurrentVolume() > room.getMaxVolume()) {
            return ResponseEntity.badRequest().body(Map.of("error", "currentVolume cannot exceed maxVolume"));
        }

        roomRepo.save(room);

        userLogService.log(securityUtils.currentUserId(), "CREATE_ROOM",
                "Tạo phòng: " + room.getName());

        // Tự động tạo cảm biến và quạt cho phòng mới
        autoSeedDevices(room.getRoomId(), room.getName());

        return ResponseEntity.ok(room);
    }

    private void autoSeedDevices(int roomId, String roomName) {
        var existing = sensorRepo.findByRoomId(roomId);

        // Kiểm tra đã có cảm biến nhiệt độ/độ ẩm chưa (connectKey hoặc tên chứa "nhiệt")
        boolean hasTempHumi = existing.stream().anyMatch(s ->
            "sensor-data".equals(s.getConnectKey()) ||
            (s.getName() != null && s.getName().toLowerCase().contains("nhiệt")));
        boolean hasLight = existing.stream().anyMatch(s ->
            "sensor-light".equals(s.getConnectKey()) ||
            (s.getName() != null && s.getName().toLowerCase().contains("ánh sáng")));
        boolean hasMotion = existing.stream().anyMatch(s ->
            "sensor-motion".equals(s.getConnectKey()) ||
            (s.getName() != null && s.getName().toLowerCase().contains("chuyển động")));

        String roomCode = resolveRoomCode(roomId);

        if (!hasTempHumi) {
            SensorDevice s = new SensorDevice();
            s.setName("Cảm biến nhiệt độ " + roomCode);
            s.setConnectKey("sensor-data");
            s.setStatus("offline");
            s.setRoomId(roomId);
            s.setInstallDate(java.time.LocalDate.now());
            sensorRepo.save(s);
        }
        if (!hasLight) {
            SensorDevice s = new SensorDevice();
            s.setName("Cảm biến ánh sáng " + roomCode);
            s.setConnectKey("sensor-light");
            s.setStatus("offline");
            s.setRoomId(roomId);
            s.setInstallDate(java.time.LocalDate.now());
            sensorRepo.save(s);
        }
        if (!hasMotion) {
            SensorDevice s = new SensorDevice();
            s.setName("Cảm biến chuyển động " + roomCode);
            s.setConnectKey("sensor-motion");
            s.setStatus("offline");
            s.setRoomId(roomId);
            s.setInstallDate(java.time.LocalDate.now());
            sensorRepo.save(s);
        }

        var existingMonitors = monitorRepo.findByRoomId(roomId);
        boolean hasTempFan  = existingMonitors.stream().anyMatch(m -> "temp-fan".equals(m.getConnectKey()));
        boolean hasHumiFan  = existingMonitors.stream().anyMatch(m -> "humi-fan".equals(m.getConnectKey()));
        boolean hasLightDev = existingMonitors.stream().anyMatch(m -> "light".equals(m.getConnectKey()) ||
            (m.getName() != null && m.getName().toLowerCase().contains("đèn")));

        if (!hasTempFan) {
            MonitorDevice f = new MonitorDevice();
            f.setName("Quạt nhiệt độ " + roomCode);
            f.setConnectKey("temp-fan");
            f.setStatus("offline");
            f.setMode("MANUAL");
            f.setRoomId(roomId);
            f.setDeviceCategory("FAN_TEMP");
            f.setInstallDate(java.time.LocalDate.now());
            monitorRepo.save(f);
        }
        if (!hasHumiFan) {
            MonitorDevice f = new MonitorDevice();
            f.setName("Quạt độ ẩm " + roomCode);
            f.setConnectKey("humi-fan");
            f.setStatus("offline");
            f.setMode("MANUAL");
            f.setRoomId(roomId);
            f.setDeviceCategory("FAN_HUMI");
            f.setInstallDate(java.time.LocalDate.now());
            monitorRepo.save(f);
        }
        if (!hasLightDev) {
            MonitorDevice d = new MonitorDevice();
            d.setName("Đèn " + roomCode);
            d.setConnectKey("light");
            d.setStatus("offline");
            d.setMode("MANUAL");
            d.setRoomId(roomId);
            d.setDeviceCategory("LIGHT");
            d.setInstallDate(java.time.LocalDate.now());
            monitorRepo.save(d);
        }
    }

    /**
     * Tính mã phòng theo format Adafruit: A1, A2, B1, B2...
     * Dựa vào khu (zone) và thứ tự phòng trong khu
     */
    private String resolveRoomCode(int roomId) {
        try {
            // Tìm zone chứa phòng này
            var zones = zoneRepo.findAll();
            for (var zone : zones) {
                var rooms = roomRepo.findByAreaId(zone.getAreaId());
                rooms.sort(java.util.Comparator.comparing(StorageRoom::getRoomId));
                for (int i = 0; i < rooms.size(); i++) {
                    if (rooms.get(i).getRoomId() == roomId) {
                        // Lấy chữ cái đầu của tên khu: "Khu A - Hải sản" → "A"
                        String areaName = zone.getAreaName() != null ? zone.getAreaName().toUpperCase() : "";
                        String letter = "X";
                        java.util.regex.Matcher m = java.util.regex.Pattern.compile("KHU\\s+([A-Z])").matcher(areaName);
                        if (m.find()) letter = m.group(1);
                        return letter + (i + 1);
                    }
                }
            }
        } catch (Exception ignored) {}
        return "R" + roomId; // fallback
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        StorageRoom room = roomRepo.findById(id).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name"))     room.setName((String) body.get("name"));
        if (body.containsKey("areaId")) {
            Integer areaId = intValue(body.get("areaId"));
            if (areaId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "areaId must be valid"));
            }
            if (!zoneRepo.existsById(areaId)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Area not found"));
            }
            room.setAreaId(areaId);
        }

        if (body.containsKey("maxVolume")) {
            room.setMaxVolume(toDouble(body.get("maxVolume"), room.getMaxVolume()));
        }
        if (body.containsKey("currentVolume")) {
            room.setCurrentVolume(toDouble(body.get("currentVolume"), room.getCurrentVolume()));
        }

        if (room.getCurrentVolume() > room.getMaxVolume()) {
            return ResponseEntity.badRequest().body(Map.of("error", "currentVolume cannot exceed maxVolume"));
        }

        roomRepo.save(room);

        userLogService.log(securityUtils.currentUserId(), "UPDATE_ROOM",
                "Cập nhật phòng: " + room.getName());
        return ResponseEntity.ok(room);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        StorageRoom room = roomRepo.findById(id).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();

        String name = room.getName();

        // Xóa device_schedule trước
        em.createNativeQuery("DELETE FROM device_schedule WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();

        // Xóa sensor devices
        em.createNativeQuery("DELETE FROM sensor_device WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();

        // Xóa monitor devices
        em.createNativeQuery("DELETE FROM monitor_device WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();

        // Xóa inventory transactions
        em.createNativeQuery("DELETE FROM inventory_transaction_item WHERE transaction_id IN (SELECT transaction_id FROM inventory_transaction WHERE room_id = ?)")
          .setParameter(1, id).executeUpdate();
        em.createNativeQuery("DELETE FROM inventory_transaction WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();

        // Xóa schedule_rooms
        em.createNativeQuery("DELETE FROM schedule_rooms WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();

        // Xóa food_has, sched_has
        em.createNativeQuery("DELETE FROM food_has WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();
        em.createNativeQuery("DELETE FROM sched_has WHERE room_id = ?")
          .setParameter(1, id).executeUpdate();

        roomRepo.deleteById(id);

        userLogService.log(securityUtils.currentUserId(), "DELETE_ROOM", "Xóa phòng: " + name);
        return ResponseEntity.ok(Map.of("message", "Đã xóa phòng"));
    }

    @PatchMapping("/{id}/volume")
    @Transactional
    public ResponseEntity<?> adjustCurrentVolume(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        StorageRoom room = roomRepo.findById(id).orElse(null);
        if (room == null) return ResponseEntity.notFound().build();

        String action = String.valueOf(body.getOrDefault("action", "IN")).trim().toUpperCase();
        BigDecimal quantity = BigDecimal.valueOf(toDouble(body.get("quantity"), 0d));
        BigDecimal unitVolume = BigDecimal.valueOf(toDouble(body.get("unitVolume"), 0d));

        if (quantity.compareTo(BigDecimal.ZERO) <= 0 || unitVolume.compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "quantity and unitVolume must be > 0"));
        }

        BigDecimal delta = quantity.multiply(unitVolume);
        BigDecimal current = BigDecimal.valueOf(room.getCurrentVolume() == null ? 0d : room.getCurrentVolume());
        BigDecimal max = BigDecimal.valueOf(room.getMaxVolume() == null ? 0d : room.getMaxVolume());

        BigDecimal updated;
        if ("OUT".equals(action)) {
            updated = current.subtract(delta).max(BigDecimal.ZERO);
        } else if ("IN".equals(action)) {
            updated = current.add(delta);
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "action must be IN or OUT"));
        }

        if (updated.compareTo(max) > 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "Room volume exceeded", "maxVolume", max));
        }

        room.setCurrentVolume(updated.doubleValue());
        roomRepo.save(room);

        userLogService.log(
                securityUtils.currentUserId(),
                "UPDATE_ROOM_VOLUME",
                "Cập nhật thể tích phòng " + room.getName() + ": " + action + " " + delta + "m3"
        );

        return ResponseEntity.ok(Map.of(
                "roomId", room.getRoomId(),
                "action", action,
                "delta", delta,
                "currentVolume", room.getCurrentVolume(),
                "maxVolume", room.getMaxVolume(),
                "utilizationPercent", room.getMaxVolume() == 0 ? 0 : (room.getCurrentVolume() / room.getMaxVolume()) * 100
        ));
    }

    private double toDouble(Object value, double defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return defaultValue;
        }
    }

    private Integer intValue(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }
}
