package com.example.demo.controller;

import com.example.demo.entity.StorageZone;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.repository.StorageZoneRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/zones")
@RequiredArgsConstructor
public class StorageZoneController {

    private final StorageZoneRepository zoneRepo;
    private final StorageRoomRepository roomRepo;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;
    private final EntityManager em;

    @GetMapping
    public ResponseEntity<?> list() {
        return ResponseEntity.ok(zoneRepo.findAll());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        StorageZone zone = new StorageZone();
        zone.setAreaName(body.get("areaName"));
        zone.setLocation(body.getOrDefault("location", ""));
        zoneRepo.save(zone);

        userLogService.log(securityUtils.currentUserId(), "CREATE_ZONE",
                "Tạo khu vực: " + zone.getAreaName());
        return ResponseEntity.ok(zone);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, String> body) {
        StorageZone zone = zoneRepo.findById(id).orElse(null);
        if (zone == null) return ResponseEntity.notFound().build();

        if (body.containsKey("areaName")) zone.setAreaName(body.get("areaName"));
        if (body.containsKey("location")) zone.setLocation(body.get("location"));
        zoneRepo.save(zone);

        userLogService.log(securityUtils.currentUserId(), "UPDATE_ZONE",
                "Cập nhật khu vực: " + zone.getAreaName());
        return ResponseEntity.ok(zone);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        StorageZone zone = zoneRepo.findById(id).orElse(null);
        if (zone == null) return ResponseEntity.notFound().build();

        String name = zone.getAreaName();
        List<Integer> roomIds = roomRepo.findByAreaId(id).stream()
                .map(room -> room.getRoomId())
                .toList();

        for (Integer roomId : roomIds) {
            deleteRoomRelations(roomId);
        }
        em.createNativeQuery("DELETE FROM storage_room WHERE area_id = ?")
                .setParameter(1, id)
                .executeUpdate();

        zoneRepo.deleteById(id);

        userLogService.log(securityUtils.currentUserId(), "DELETE_ZONE",
                "Xóa khu vực: " + name);
        return ResponseEntity.ok(Map.of("message", "Đã xóa khu vực"));
    }

    private void deleteRoomRelations(Integer roomId) {
        em.createNativeQuery("DELETE FROM device_schedule WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM sensor_device WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM monitor_device WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM inventory_transaction_item WHERE transaction_id IN (SELECT transaction_id FROM inventory_transaction WHERE room_id = ?)")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM inventory_transaction WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM schedule_rooms WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM food_has WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
        em.createNativeQuery("DELETE FROM sched_has WHERE room_id = ?")
                .setParameter(1, roomId).executeUpdate();
    }
}
