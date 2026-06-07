package com.example.demo.controller;

import com.example.demo.entity.MonitorDevice;
import com.example.demo.repository.MonitorDeviceRepository;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/devices")
@RequiredArgsConstructor
public class MonitorDeviceController {

    private final MonitorDeviceRepository deviceRepo;
    private final StorageRoomRepository roomRepo;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) Integer roomId) {
        if (roomId != null) return ResponseEntity.ok(deviceRepo.findByRoomId(roomId));
        return ResponseEntity.ok(deviceRepo.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable Integer id) {
        return deviceRepo.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        MonitorDevice device = new MonitorDevice();
        device.setName((String) body.get("name"));
        device.setConnectKey(body.getOrDefault("connectKey", "key-" + System.currentTimeMillis()).toString());
        device.setStatus(body.getOrDefault("status", "offline").toString());
        device.setMode(body.getOrDefault("mode", "MANUAL").toString());
        if (body.containsKey("roomId")) device.setRoomId((Integer) body.get("roomId"));
        if (body.containsKey("deviceCategory")) device.setDeviceCategory((String) body.get("deviceCategory"));
        device.setInstallDate(LocalDate.now());
        deviceRepo.save(device);

        userLogService.log(securityUtils.currentUserId(), "CREATE_DEVICE",
                "Thêm thiết bị: " + device.getName());
        return ResponseEntity.ok(device);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        MonitorDevice device = deviceRepo.findById(id).orElse(null);
        if (device == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name"))           device.setName((String) body.get("name"));
        if (body.containsKey("status"))         device.setStatus((String) body.get("status"));
        if (body.containsKey("mode"))           device.setMode((String) body.get("mode"));
        if (body.containsKey("connectKey"))     device.setConnectKey((String) body.get("connectKey"));
        if (body.containsKey("roomId"))         device.setRoomId((Integer) body.get("roomId"));
        if (body.containsKey("value"))          device.setValue(Double.parseDouble(body.get("value").toString()));
        if (body.containsKey("deviceCategory")) device.setDeviceCategory((String) body.get("deviceCategory"));
        deviceRepo.save(device);

        userLogService.log(securityUtils.currentUserId(), "UPDATE_DEVICE",
                "Cập nhật thiết bị: " + device.getName());
        return ResponseEntity.ok(device);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        MonitorDevice device = deviceRepo.findById(id).orElse(null);
        if (device == null) return ResponseEntity.notFound().build();

        String name = device.getName();
        deviceRepo.deleteById(id);

        userLogService.log(securityUtils.currentUserId(), "DELETE_DEVICE",
                "Xóa thiết bị: " + name);
        return ResponseEntity.ok(Map.of("message", "Đã xóa thiết bị"));
    }

    /**
     * POST /api/devices/seed-fans?roomId=1
     * Tự động tạo quạt nhiệt độ + quạt độ ẩm cho phòng nếu chưa có
     */
    @PostMapping("/seed-fans")
    public ResponseEntity<?> seedFans(@RequestParam Integer roomId) {
        return ResponseEntity.ok(doSeedFans(roomId));
    }

    /**
     * POST /api/devices/seed-fans-all
     * Tự động tạo quạt cho TẤT CẢ phòng hiện có
     */
    @PostMapping("/seed-fans-all")
    public ResponseEntity<?> seedFansAll() {
        List<Map<String, Object>> results = roomRepo.findAll().stream()
                .map(room -> doSeedFans(room.getRoomId()))
                .collect(java.util.stream.Collectors.toList());
        int total = results.stream().mapToInt(r -> (int) r.get("created")).sum();
        return ResponseEntity.ok(Map.of("rooms", results.size(), "totalCreated", total));
    }

    private Map<String, Object> doSeedFans(Integer roomId) {
        boolean hasTempFan = deviceRepo.findByRoomId(roomId).stream()
                .anyMatch(d -> "temp-fan".equals(d.getConnectKey()));
        boolean hasHumiFan = deviceRepo.findByRoomId(roomId).stream()
                .anyMatch(d -> "humi-fan".equals(d.getConnectKey()));

        int created = 0;
        if (!hasTempFan) {
            MonitorDevice fan = new MonitorDevice();
            fan.setName("Quạt nhiệt độ - Phòng " + roomId);
            fan.setConnectKey("temp-fan");
            fan.setStatus("offline");
            fan.setMode("MANUAL");
            fan.setRoomId(roomId);
            fan.setDeviceCategory("FAN_TEMP");
            fan.setInstallDate(java.time.LocalDate.now());
            deviceRepo.save(fan);
            created++;
        }
        if (!hasHumiFan) {
            MonitorDevice fan = new MonitorDevice();
            fan.setName("Quạt độ ẩm - Phòng " + roomId);
            fan.setConnectKey("humi-fan");
            fan.setStatus("offline");
            fan.setMode("MANUAL");
            fan.setRoomId(roomId);
            fan.setDeviceCategory("FAN_HUMI");
            fan.setInstallDate(java.time.LocalDate.now());
            deviceRepo.save(fan);
            created++;
        }
        return Map.of("roomId", roomId, "created", created,
                "message", created == 0 ? "Đã có đủ quạt" : "Tạo " + created + " quạt");
    }
}
