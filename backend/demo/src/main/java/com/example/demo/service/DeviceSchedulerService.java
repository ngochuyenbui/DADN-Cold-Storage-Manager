package com.example.demo.service;

import com.example.demo.entity.DeviceSchedule;
import com.example.demo.entity.MonitorDevice;
import com.example.demo.mqtt.AdafruitMqttService;
import com.example.demo.repository.DeviceScheduleRepository;
import com.example.demo.repository.MonitorDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceSchedulerService {

    private final DeviceScheduleRepository scheduleRepo;
    private final MonitorDeviceRepository deviceRepo;
    private final AdafruitMqttService mqttService;

    private static final ZoneId SCHEDULE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Map<DayOfWeek, String> DAY_MAP = Map.of(
        DayOfWeek.MONDAY, "MON",
        DayOfWeek.TUESDAY, "TUE",
        DayOfWeek.WEDNESDAY, "WED",
        DayOfWeek.THURSDAY, "THU",
        DayOfWeek.FRIDAY, "FRI",
        DayOfWeek.SATURDAY, "SAT",
        DayOfWeek.SUNDAY, "SUN"
    );

    @Scheduled(fixedRate = 30000)
    public void checkAndApplySchedules() {
        if (!mqttService.isConnected()) {
            log.debug("[Scheduler] MQTT not connected, skip");
            return;
        }

        int mode = mqttService.getCurrentMode();
        if (mode == 0) {
            log.debug("[Scheduler] Manual mode wins, skip schedules");
            return;
        }

        ZonedDateTime now = ZonedDateTime.now(SCHEDULE_ZONE);
        LocalDateTime nowLocal = now.toLocalDateTime().withSecond(0).withNano(0);
        LocalTime currentTime = now.toLocalTime().withSecond(0).withNano(0);
        String currentDay = DAY_MAP.get(now.getDayOfWeek());
        String previousDay = DAY_MAP.get(now.minusDays(1).getDayOfWeek());

        List<DeviceSchedule> schedules = scheduleRepo.findByActiveTrue();
        Map<Integer, ScheduleCommand> winningByDevice = new HashMap<>();

        for (DeviceSchedule sched : schedules) {
            ScheduleCommand command = commandFor(sched, nowLocal, currentTime, currentDay, previousDay);
            if (command == null) continue;
            winningByDevice.merge(
                sched.getDeviceId(),
                command,
                (oldCommand, newCommand) -> comparePriority(newCommand, oldCommand) >= 0 ? newCommand : oldCommand
            );
        }

        log.info("[Scheduler] Applying {} winning schedule command(s)", winningByDevice.size());
        for (ScheduleCommand command : winningByDevice.values()) {
            DeviceSchedule sched = command.schedule();
            MonitorDevice device = deviceRepo.findById(sched.getDeviceId()).orElse(null);
            if (device == null) {
                log.warn("[Scheduler] Device id={} not found", sched.getDeviceId());
                continue;
            }

            applyDeviceState(device, sched.getRoomId(), command.turnOn());

            if (command.markRun()) {
                sched.setLastRunAt(nowLocal);
                if (command.deactivateAfterRun()) sched.setActive(false);
                scheduleRepo.save(sched);
            }
        }
    }

    private ScheduleCommand commandFor(DeviceSchedule sched, LocalDateTime nowLocal, LocalTime currentTime, String currentDay, String previousDay) {
        if ("one_time".equalsIgnoreCase(sched.getScheduleType())) {
            return oneTimeCommand(sched, nowLocal);
        }

        return repeatCommand(sched, nowLocal, currentTime, currentDay, previousDay);
    }

    private ScheduleCommand oneTimeCommand(DeviceSchedule sched, LocalDateTime nowLocal) {
        LocalDateTime startAt = sched.getOneTimeAt();
        if (startAt == null) return null;

        if (isMomentAction(sched)) {
            if (sched.getLastRunAt() != null || nowLocal.isBefore(startAt)) return null;
            return new ScheduleCommand(sched, isOnlyOnAction(sched), true, true);
        }

        if (sched.getEndTime() == null) return null;

        LocalDateTime endAt = LocalDateTime.of(startAt.toLocalDate(), sched.getEndTime());
        if (!endAt.isAfter(startAt)) endAt = endAt.plusDays(1);

        if (nowLocal.isBefore(startAt)) return null;
        if (nowLocal.isBefore(endAt)) return new ScheduleCommand(sched, true, false, false);
        if (sched.getLastRunAt() == null || sched.getLastRunAt().isBefore(endAt)) {
            return new ScheduleCommand(sched, false, true, true);
        }
        return null;
    }

    private ScheduleCommand repeatCommand(DeviceSchedule sched, LocalDateTime nowLocal, LocalTime currentTime, String currentDay, String previousDay) {
        LocalTime start = sched.getStartTime();
        LocalTime end = sched.getEndTime();
        if (start == null) return null;

        String days = sched.getDaysOfWeek() == null ? "" : sched.getDaysOfWeek();
        if (isMomentAction(sched)) {
            if (!days.contains(currentDay) || currentTime.isBefore(start) || alreadyRanToday(sched, nowLocal)) return null;
            return new ScheduleCommand(sched, isOnlyOnAction(sched), false, true);
        }

        if (end == null || start.equals(end)) return null;

        if (start.isBefore(end)) {
            if (!days.contains(currentDay)) return null;
            if (!currentTime.isBefore(start) && currentTime.isBefore(end)) return new ScheduleCommand(sched, true, false, false);
            if (!currentTime.isBefore(end)) return new ScheduleCommand(sched, false, false, false);
            return null;
        }

        if (days.contains(currentDay) && !currentTime.isBefore(start)) return new ScheduleCommand(sched, true, false, false);
        if (days.contains(previousDay)) {
            if (currentTime.isBefore(end)) return new ScheduleCommand(sched, true, false, false);
            return new ScheduleCommand(sched, false, false, false);
        }
        return null;
    }

    private int comparePriority(ScheduleCommand left, ScheduleCommand right) {
        int byType = Integer.compare(priority(left.schedule()), priority(right.schedule()));
        if (byType != 0) return byType;

        LocalDateTime leftCreated = left.schedule().getCreatedAt() == null ? LocalDateTime.MIN : left.schedule().getCreatedAt();
        LocalDateTime rightCreated = right.schedule().getCreatedAt() == null ? LocalDateTime.MIN : right.schedule().getCreatedAt();
        return leftCreated.compareTo(rightCreated);
    }

    private int priority(DeviceSchedule sched) {
        if ("one_time".equalsIgnoreCase(sched.getScheduleType())) return 20;
        return 10;
    }

    private boolean alreadyRanToday(DeviceSchedule sched, LocalDateTime nowLocal) {
        LocalDateTime lastRunAt = sched.getLastRunAt();
        return lastRunAt != null && lastRunAt.toLocalDate().equals(nowLocal.toLocalDate());
    }

    private boolean isMomentAction(DeviceSchedule sched) {
        return isOnlyOnAction(sched) || isOnlyOffAction(sched);
    }

    private boolean isOnlyOnAction(DeviceSchedule sched) {
        return "ONLY_ON".equalsIgnoreCase(sched.getAction());
    }

    private boolean isOnlyOffAction(DeviceSchedule sched) {
        String action = sched.getAction();
        return "ONLY_OFF".equalsIgnoreCase(action) || "OFF".equalsIgnoreCase(action);
    }

    private void applyDeviceState(MonitorDevice device, Integer roomId, boolean on) {
        try {
            device.setStatus(on ? "ON" : "OFF");
            deviceRepo.save(device);

            int tempFanVal = "temp-fan".equals(device.getConnectKey()) ? (on ? 1 : 0) : getCurrentDeviceState(roomId, "temp-fan");
            int humiFanVal = "humi-fan".equals(device.getConnectKey()) ? (on ? 1 : 0) : getCurrentDeviceState(roomId, "humi-fan");
            int lightVal = "light".equals(device.getConnectKey()) ? (on ? 1 : 0) : getCurrentDeviceState(roomId, "light");

            String value = mqttService.resolveRoomCode(roomId) + ":t=" + tempFanVal + ",h=" + humiFanVal + ",l=" + lightVal;
            mqttService.publish("device-control", value);
            log.info("[Scheduler] Published device-control {}", value);
        } catch (Exception e) {
            log.error("[Scheduler] Error applying schedule for device {}: {}", device.getName(), e.getMessage(), e);
        }
    }

    private int getCurrentDeviceState(Integer roomId, String connectKey) {
        return deviceRepo.findByRoomId(roomId).stream()
            .filter(d -> connectKey.equals(d.getConnectKey()))
            .findFirst()
            .map(d -> {
                String status = d.getStatus() == null ? "" : d.getStatus();
                return "ON".equalsIgnoreCase(status) || "online".equalsIgnoreCase(status) ? 1 : 0;
            })
            .orElse(0);
    }

    private record ScheduleCommand(DeviceSchedule schedule, boolean turnOn, boolean deactivateAfterRun, boolean markRun) {}
}
