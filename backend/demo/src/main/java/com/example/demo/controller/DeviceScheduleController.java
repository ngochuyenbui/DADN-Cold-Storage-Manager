package com.example.demo.controller;

import com.example.demo.entity.DeviceSchedule;
import com.example.demo.mqtt.AdafruitMqttService;
import com.example.demo.repository.DeviceScheduleRepository;
import com.example.demo.service.DeviceSchedulerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/device-schedules")
@RequiredArgsConstructor
@Slf4j
public class DeviceScheduleController {

    private final DeviceScheduleRepository repo;
    private final DeviceSchedulerService schedulerService;
    private final AdafruitMqttService mqttService;

    @PostMapping("/run")
    public ResponseEntity<?> runNow() {
        schedulerService.checkAndApplySchedules();
        return ResponseEntity.ok(Map.of("message", "Da chay scheduler"));
    }

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) Integer roomId) {
        if (roomId != null) return ResponseEntity.ok(repo.findByRoomId(roomId));
        return ResponseEntity.ok(repo.findAll());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        Integer roomId = intVal(body.get("roomId"));
        String name = strVal(body.get("name"));
        List<Integer> deviceIds = deviceIds(body);

        if (deviceIds.isEmpty() || roomId == null || name == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "deviceId/deviceIds, roomId, name are required"));
        }

        List<DeviceSchedule> created = new ArrayList<>();
        for (Integer deviceId : deviceIds) {
            DeviceSchedule sched = new DeviceSchedule();
            sched.setDeviceId(deviceId);
            sched.setRoomId(roomId);
            applyBody(sched, body, true);
            repo.save(sched);
            created.add(sched);
        }

        publishScheduleFeed(roomId);
        return ResponseEntity.ok(created.size() == 1 ? created.get(0) : created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        DeviceSchedule sched = repo.findById(id).orElse(null);
        if (sched == null) return ResponseEntity.notFound().build();

        applyBody(sched, body, false);
        repo.save(sched);
        publishScheduleFeed(sched.getRoomId());
        return ResponseEntity.ok(sched);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        Integer roomId = repo.findById(id).map(DeviceSchedule::getRoomId).orElse(null);
        repo.deleteById(id);
        if (roomId != null) publishScheduleFeed(roomId);
        return ResponseEntity.ok(Map.of("message", "Da xoa lich thiet bi"));
    }

    private void publishScheduleFeed(Integer roomId) {
        if (roomId == null) return;
        try {
            mqttService.publishScheduleForRoom(roomId);
        } catch (Exception e) {
            log.warn("Cannot publish schedule feed for roomId={}: {}", roomId, e.getMessage());
        }
    }

    private List<Integer> deviceIds(Map<String, Object> body) {
        List<Integer> ids = new ArrayList<>();
        Object many = body.get("deviceIds");
        if (many instanceof List<?> list) {
            for (Object item : list) {
                Integer id = intVal(item);
                if (id != null) ids.add(id);
            }
        }

        Integer one = intVal(body.get("deviceId"));
        if (one != null && !ids.contains(one)) ids.add(one);
        return ids;
    }

    private void applyBody(DeviceSchedule sched, Map<String, Object> body, boolean creating) {
        if (creating || body.containsKey("name")) sched.setName(strVal(body.get("name")));

        String scheduleType = strVal(firstNonNull(body.get("scheduleType"), body.get("schedule_type")));
        if (scheduleType != null) {
            sched.setScheduleType(scheduleType.equals("one_time") ? "one_time" : "repeat");
        } else if (creating) {
            sched.setScheduleType("repeat");
        }

        String oneTimeAt = strVal(firstNonNull(body.get("oneTimeAt"), body.get("scheduledAt")));
        if (oneTimeAt != null) {
            sched.setOneTimeAt(LocalDateTime.parse(oneTimeAt));
        }

        String start = strVal(body.get("startTime"));
        String end = strVal(body.get("endTime"));
        if (start != null) sched.setStartTime(LocalTime.parse(start));
        if (end != null) sched.setEndTime(LocalTime.parse(end));

        if ("one_time".equals(sched.getScheduleType()) && sched.getOneTimeAt() != null && sched.getStartTime() != null) {
            sched.setOneTimeAt(LocalDateTime.of(sched.getOneTimeAt().toLocalDate(), sched.getStartTime()));
        }

        if (sched.getStartTime() == null && sched.getOneTimeAt() != null) sched.setStartTime(sched.getOneTimeAt().toLocalTime());
        if (sched.getStartTime() == null) sched.setStartTime(LocalTime.parse("00:00"));
        if (sched.getEndTime() == null) sched.setEndTime(sched.getStartTime());

        String action = strVal(body.get("action"));
        if (action != null) sched.setAction(normalizeAction(action));
        else if (creating) sched.setAction("WINDOW");

        if (body.containsKey("temperatureThreshold")) {
            sched.setTemperatureThreshold(doubleVal(body.get("temperatureThreshold")));
        }

        if (body.containsKey("active")) sched.setActive(Boolean.parseBoolean(body.get("active").toString()));
        else if (creating) sched.setActive(true);

        if (body.containsKey("daysOfWeek")) {
            Object days = body.get("daysOfWeek");
            if (days instanceof String s && !s.isBlank()) {
                sched.setDaysOfWeek(s);
            } else if (days instanceof List<?> list) {
                sched.setDaysOfWeek(String.join(",", list.stream().map(Object::toString).toList()));
            }
        } else if (creating && sched.getDaysOfWeek() == null) {
            sched.setDaysOfWeek("MON,TUE,WED,THU,FRI,SAT,SUN");
        }

        if (creating) sched.setCreatedAt(LocalDateTime.now());
    }

    private Object firstNonNull(Object first, Object second) {
        return first != null ? first : second;
    }

    private String normalizeAction(String action) {
        String normalized = action == null ? "" : action.trim().toUpperCase();
        return switch (normalized) {
            case "ONLY_ON" -> "ONLY_ON";
            case "ONLY_OFF", "OFF" -> "ONLY_OFF";
            case "WINDOW", "RANGE" -> "WINDOW";
            default -> "WINDOW";
        };
    }

    private Integer intVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return null; }
    }

    private Double doubleVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (Exception e) { return null; }
    }

    private String strVal(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
