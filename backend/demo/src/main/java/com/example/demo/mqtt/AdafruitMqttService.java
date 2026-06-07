    package com.example.demo.mqtt;

import com.example.demo.entity.DeviceLog;
import com.example.demo.entity.DeviceSchedule;
import com.example.demo.entity.MonitorDevice;
import com.example.demo.entity.SensorDevice;
import com.example.demo.service.AlertService;
import com.example.demo.repository.DeviceLogRepository;
import com.example.demo.repository.SensorDeviceRepository;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.repository.StorageZoneRepository;
import com.example.demo.websocket.DeviceStateMessage;
import com.example.demo.websocket.SensorDataMessage;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Feed structure (Adafruit group FOOD_STORAGE_CONTROL):
 *
 *  sensor-data  → "r1:t=25,h=50"   (room1, temp + humi)
 *  fan-control  → "r1:t=0,h=1"     (room1, temp-fan + humi-fan, chỉ 0/1)
 *  threshold    → "r1:t=25,h=50"   (room1, temp-threshold + humi-threshold)
 *  mode         → "0" | "1" | "2"  (0=Manual, 1=Auto, 2=Schedule)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdafruitMqttService {

    private static final DateTimeFormatter SCHEDULE_TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter COMPACT_SCHEDULE_TIME_FORMAT = DateTimeFormatter.ofPattern("HHmm");
    private static final String SCHEDULE_DEFAULT_RANGE = "00:00-23:59";
    private static final String SCHEDULE_DISABLED_RANGE = "00:00-00:00";

    @Value("${adafruit.username}")
    private String username;

    @Value("${adafruit.key}")
    private String aioKey;

    @Value("${adafruit.mqtt.host}")
    private String host;

    @Value("${adafruit.mqtt.port}")
    private int port;

    private MqttClient mqttClient;

    private final SimpMessagingTemplate messagingTemplate;
    private final SensorDeviceRepository sensorDeviceRepository;
    private final DeviceLogRepository deviceLogRepository;
    private final AlertService alertService;
    private final StorageRoomRepository storageRoomRepository;
    private final StorageZoneRepository storageZoneRepository;
    private final com.example.demo.repository.MonitorDeviceRepository monitorDeviceRepository;
    private final com.example.demo.repository.DeviceScheduleRepository deviceScheduleRepository;

    // Lưu ngưỡng hiện tại (cập nhật khi nhận threshold feed)
    private double currentTempThreshold = 35.0;
    private double currentHumiThreshold = 60.0;
    private int    currentMode          = 0; // 0=Manual, 1=Auto, 2=Schedule

    @PostConstruct
    public void connect() {
        try {
            String broker = "tcp://" + host + ":" + port;
            String clientId = "freshguard-" + System.currentTimeMillis();
            mqttClient = new MqttClient(broker, clientId, new MemoryPersistence());

            MqttConnectOptions options = new MqttConnectOptions();
            options.setUserName(username);
            options.setPassword(aioKey.toCharArray());
            options.setCleanSession(true);
            options.setAutomaticReconnect(true);
            options.setKeepAliveInterval(60);

            mqttClient.setCallback(new MqttCallback() {
                @Override public void connectionLost(Throwable cause) {
                    log.warn("MQTT connection lost: {}", cause.getMessage());
                }
                @Override public void messageArrived(String topic, MqttMessage message) {
                    handleMessage(topic, new String(message.getPayload()));
                }
                @Override public void deliveryComplete(IMqttDeliveryToken token) {}
            });

            mqttClient.connect(options);
            log.info("Connected to Adafruit IO MQTT");

            String group = username + "/feeds";
            mqttClient.subscribe(group + "sensor-data",    1);
            mqttClient.subscribe(group + "device-control", 1);
            mqttClient.subscribe(group + "device-state",   1);
            mqttClient.subscribe(group + "threshold",      1);
            mqttClient.subscribe(group + "mode",           1);
            mqttClient.subscribe(group + "schedule",       1);
            // Legacy feeds
            mqttClient.subscribe(group + "fan-control",    1);

            log.info("Subscribed to feeds: sensor-data, device-control, device-state, threshold, mode, schedule");

            // Đọc mode hiện tại từ Adafruit REST để đồng bộ ngay khi start
            try {
                org.springframework.web.client.RestTemplate rt = new org.springframework.web.client.RestTemplate();
                String modeUrl = "https://io.adafruit.com/api/v2/" + username + "/feeds/mode/data/last";
                org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
                h.set("X-AIO-Key", aioKey);
                @SuppressWarnings("unchecked")
                java.util.Map<String, Object> resp = rt.exchange(modeUrl,
                    org.springframework.http.HttpMethod.GET,
                    new org.springframework.http.HttpEntity<>(h),
                    java.util.Map.class).getBody();
                if (resp != null && resp.get("value") != null) {
                    String modeValue = resp.get("value").toString().trim();
                    if (modeValue.contains(":")) {
                        modeValue = modeValue.substring(modeValue.indexOf(':') + 1).trim();
                    }
                    currentMode = Integer.parseInt(modeValue);
                    log.info("Đồng bộ mode từ Adafruit: {}", currentMode);
                }
            } catch (Exception e) {
                log.warn("Không thể đọc mode từ Adafruit: {}", e.getMessage());
            }

        } catch (MqttException e) {
            log.error("Failed to connect MQTT: {}", e.getMessage());
        }
    }

    private void handleMessage(String topic, String payload) {
        log.info("MQTT | topic={} value={}", topic, payload);
        String trimmed = payload.trim();

        if (topic.endsWith("sensor-data")) {
            handleSensorData(trimmed);
        } else if (topic.endsWith("device-control")) {
            handleDeviceControl(trimmed);
        } else if (topic.endsWith("device-state")) {
            handleDeviceState(trimmed);
        } else if (topic.endsWith("fan-control")) {
            handleFanControl(trimmed); // legacy
        } else if (topic.endsWith("threshold")) {
            handleThreshold(trimmed);
        } else if (topic.endsWith("mode")) {
            handleMode(trimmed);
        } else if (topic.endsWith("schedule")) {
            handleScheduleFeed(trimmed);
        }
    }

    // ── sensor-data: "r1:t=25,h=50" ─────────────────────────────────────────

    private void handleSensorData(String payload) {
        ParsedRoom parsed = parseRoomPayload(payload);
        if (parsed == null) return;

        double temp = parsed.t;
        double humi = parsed.h;
        String ts = LocalDateTime.now().toString();

        // Cập nhật sensor_device theo roomId
        List<SensorDevice> sensors = sensorDeviceRepository.findByRoomId(parsed.roomId);
        for (SensorDevice s : sensors) {
            s.setTemperature(temp);
            s.setHumidity(humi);
            s.setLastUpdated(LocalDateTime.now());
            s.setStatus("online");
            sensorDeviceRepository.save(s);
            // Lưu log với đúng deviceId của sensor
            saveLog("SENSOR_TEMP", String.valueOf(temp), s.getDeviceId());
            saveLog("SENSOR_HUMI", String.valueOf(humi), s.getDeviceId());
            if (parsed.light() >= 0) saveLog("SENSOR_LIGHT", String.valueOf(parsed.light()), s.getDeviceId());
            if (parsed.motion() >= 0) saveLog("SENSOR_MOTION", String.valueOf(parsed.motion()), s.getDeviceId());
        }

        // Nếu không có sensor nào trong phòng, vẫn lưu log với roomId (legacy)
        if (sensors.isEmpty()) {
            saveLog("SENSOR_TEMP", String.valueOf(temp), parsed.roomId);
            saveLog("SENSOR_HUMI", String.valueOf(humi), parsed.roomId);
        }

        messagingTemplate.convertAndSend("/topic/sensor-data",
            new SensorDataMessage("temp", temp, ts, parsed.roomId));
        messagingTemplate.convertAndSend("/topic/sensor-data",
            new SensorDataMessage("humi", humi, ts, parsed.roomId));
        if (parsed.light() >= 0) messagingTemplate.convertAndSend("/topic/sensor-data",
            new SensorDataMessage("light", parsed.light(), ts, parsed.roomId));
        if (parsed.motion() >= 0) messagingTemplate.convertAndSend("/topic/sensor-data",
            new SensorDataMessage("motion", parsed.motion(), ts, parsed.roomId));

        alertService.checkAndAlert(parsed.roomId, temp, humi,
            currentTempThreshold, currentHumiThreshold);

        // Mode Auto (1) hoặc Schedule (2): backend tự điều khiển quạt theo ngưỡng
        if (currentMode == 1 || currentMode == 2) {
            int tempFan = temp > currentTempThreshold ? 1 : 0;
            int humiFan = humi > currentHumiThreshold ? 1 : 0;
            try {
                publishFanControl(parsed.roomId, tempFan, humiFan);
                log.info("[Auto] room={} temp={}/{} humi={}/{} → tempFan={} humiFan={}",
                    parsed.roomId, temp, currentTempThreshold, humi, currentHumiThreshold, tempFan, humiFan);
            } catch (Exception e) {
                log.warn("[Auto] Không thể publish fan-control: {}", e.getMessage());
            }
        }
    }

    // ── fan-control: "r1:t=0,h=1" ───────────────────────────────────────────

    private void handleFanControl(String payload) {
        ParsedRoom parsed = parseRoomPayload(payload);
        if (parsed == null) return;

        String tempFanVal = parsed.t == 1 ? "1" : "0";
        String humiFanVal = parsed.h == 1 ? "1" : "0";
        String ts = LocalDateTime.now().toString();

        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("temp-fan", tempFanVal, ts, parsed.roomId));
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("humi-fan", humiFanVal, ts, parsed.roomId));
    }

    // ── device-control: "A1:t=0,h=0,l=1" → bật/tắt thiết bị ────────────────
    private void handleDeviceControl(String payload) {
        ParsedRoom parsed = parseRoomPayload(payload);
        if (parsed == null) return;
        String ts = LocalDateTime.now().toString();
        // t=temp-fan, h=humi-fan, l=light
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("temp-fan", parsed.t == 1 ? "1" : "0", ts, parsed.roomId));
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("humi-fan", parsed.h == 1 ? "1" : "0", ts, parsed.roomId));
        if (parsed.light() >= 0) messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("light", String.valueOf((int)parsed.light()), ts, parsed.roomId));
        log.info("[device-control] room={} t={} h={} l={}", parsed.roomId, parsed.t, parsed.h, parsed.light());
    }

    // ── device-state: "A1:t=0,h=0,l=0" → trạng thái thực tế từ mạch ────────
    private void handleDeviceState(String payload) {
        ParsedRoom parsed = parseRoomPayload(payload);
        if (parsed == null) return;
        String ts = LocalDateTime.now().toString();
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("temp-fan", parsed.t == 1 ? "1" : "0", ts, parsed.roomId));
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("humi-fan", parsed.h == 1 ? "1" : "0", ts, parsed.roomId));
        if (parsed.light() >= 0) messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("light", String.valueOf((int)parsed.light()), ts, parsed.roomId));
        log.info("[device-state] room={} t={} h={} l={}", parsed.roomId, parsed.t, parsed.h, parsed.light());
    }

    // ── schedule feed: "A1:t=06:00-18:00,h=00:00-23:59,l=00:00-00:00" ──────
    private void handleScheduleFeed(String payload) {
        try {
            int colonIdx = payload.indexOf(':');
            String roomCode = payload.substring(0, colonIdx).trim();
            String rest = payload.substring(colonIdx + 1);

            // Parse roomId từ roomCode
            ParsedRoom dummy = parseRoomPayload(roomCode + ":t=0,h=0");
            if (dummy == null) return;
            int roomId = dummy.roomId;

            // Parse từng thiết bị: t=start-end, h=start-end, l=start-end.
            // Lịch tắt dùng: "00:00-00:00".
            for (String part : rest.split(",")) {
                String[] kv = part.split("=");
                if (kv.length != 2) continue;
                String key = kv[0].trim().toLowerCase();
                String[] times = splitScheduleRange(kv[1]);
                if (times == null) continue;
                String startTime = times[0];
                String endTime   = times[1];
                boolean defaultRange = isScheduleRange(startTime, endTime, SCHEDULE_DEFAULT_RANGE);
                boolean disabledRange = isScheduleRange(startTime, endTime, SCHEDULE_DISABLED_RANGE);

                String connectKey = switch (key) {
                    case "t" -> "temp-fan";
                    case "h" -> "humi-fan";
                    case "l" -> "light";
                    default  -> null;
                };
                if (connectKey == null) continue;
                if (defaultRange) continue;

                // Tìm device trong phòng
                monitorDeviceRepository.findByRoomId(roomId).stream()
                    .filter(d -> connectKey.equals(d.getConnectKey()))
                    .findFirst()
                    .ifPresent(device -> {
                        if (disabledRange) {
                            deviceScheduleRepository.findByDeviceIdAndActiveTrue(device.getDeviceId())
                                .forEach(sched -> {
                                    sched.setActive(false);
                                    deviceScheduleRepository.save(sched);
                                });
                            log.info("[schedule] room={} {} disabled", roomId, connectKey);
                            return;
                        }

                        // Lưu/cập nhật device_schedule
                        deviceScheduleRepository.findByDeviceIdAndActiveTrue(device.getDeviceId())
                            .stream().findFirst().ifPresentOrElse(
                                sched -> {
                                    try {
                                        sched.setStartTime(parseScheduleTime(startTime));
                                        sched.setEndTime(parseScheduleTime(endTime));
                                        deviceScheduleRepository.save(sched);
                                    } catch (Exception ignored) {}
                                },
                                () -> {
                                    try {
                                        com.example.demo.entity.DeviceSchedule sched = new com.example.demo.entity.DeviceSchedule();
                                        sched.setDeviceId(device.getDeviceId());
                                        sched.setRoomId(roomId);
                                        sched.setName("Lịch " + connectKey + " " + roomCode);
                                        sched.setStartTime(parseScheduleTime(startTime));
                                        sched.setEndTime(parseScheduleTime(endTime));
                                        sched.setActive(true);
                                        sched.setCreatedAt(LocalDateTime.now());
                                        deviceScheduleRepository.save(sched);
                                    } catch (Exception ignored) {}
                                }
                            );
                        log.info("[schedule] room={} {} {}→{}", roomId, connectKey, startTime, endTime);
                    });
            }
        } catch (Exception e) {
            log.warn("[schedule] Parse error: {} — {}", payload, e.getMessage());
        }
    }

    private void handleThreshold(String payload) {
        ParsedRoom parsed = parseRoomPayload(payload);
        if (parsed == null) return;

        // Cập nhật ngưỡng hiện tại để dùng cho alert check
        currentTempThreshold = parsed.t;
        currentHumiThreshold = parsed.h;

        String ts = LocalDateTime.now().toString();
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("temp-threshold", String.valueOf(parsed.t), ts, parsed.roomId));
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("humi-threshold", String.valueOf(parsed.h), ts, parsed.roomId));
    }

    private void handleMode(String payload) {
        // Format mới: "A1:0" hoặc "A1:1" hoặc "A1:2"
        // Format cũ: "0" | "1" | "2"
        String modeStr = payload.trim();
        if (modeStr.contains(":")) {
            modeStr = modeStr.substring(modeStr.indexOf(':') + 1).trim();
        }
        try { currentMode = Integer.parseInt(modeStr); } catch (Exception ignored) {}
        messagingTemplate.convertAndSend("/topic/device-state",
            new DeviceStateMessage("mode", modeStr, LocalDateTime.now().toString(), 0));
        log.info("[mode] currentMode={}", currentMode);
    }

    public int getCurrentMode() { return currentMode; }

    /** Tính mã phòng theo format Adafruit: A1, B1, C1... */
    public String resolveRoomCode(int roomId) {
        try {
            var zones = storageZoneRepository.findAll();
            for (var zone : zones) {
                var rooms = storageRoomRepository.findByAreaId(zone.getAreaId());
                rooms.sort(java.util.Comparator.comparing(r -> r.getRoomId()));
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

    /** Inject sensor data trực tiếp (dùng để test không cần Adafruit) */
    public void simulateSensorData(String payload) {
        handleSensorData(payload);
    }

    // ── Publish lệnh từ frontend → Adafruit → Yolobit ────────────────────────

    /**
     * Publish một feed đơn (mode).
     */
    public boolean isConnected() {
        return mqttClient != null && mqttClient.isConnected();
    }

    public void publish(String feedKey, String value) {
        if (mqttClient == null || !mqttClient.isConnected()) {
            log.error("MQTT not connected! Cannot publish {}={}", feedKey, value);
            throw new RuntimeException("MQTT chưa kết nối tới Adafruit IO");
        }
        try {
            String topic = username + "/feeds/food-storage-control." + feedKey;
            MqttMessage msg = new MqttMessage(value.getBytes());
            msg.setQos(1);
            mqttClient.publish(topic, msg);
            log.info("✓ Published {}={}", feedKey, value);
            saveLog("COMMAND", "CMD " + feedKey + "=" + value, 0);
        } catch (MqttException e) {
            log.error("MQTT publish failed: {}", e.getMessage());
            throw new RuntimeException("MQTT publish failed: " + e.getMessage());
        }
    }

    /**
     * Publish fan-control: "r1:t={tVal},h={hVal}"
     */
    public void publishFanControl(int roomId, int tempFan, int humiFan) {
        String value = "r" + roomId + ":t=" + tempFan + ",h=" + humiFan;
        publish("fan-control", value);
    }

    /**
     * Publish all device schedules in one room to the schedule feed.
     * Format: "A1:t=06:00-18:00,h=00:00-23:59,l=00:00-00:00"
     * Missing schedule: 00:00-23:59. Disabled schedule: 00:00-00:00.
     */
    public void publishScheduleForRoom(int roomId) {
        String roomCode = resolveRoomCode(roomId);
        Map<Integer, MonitorDevice> devicesById = monitorDeviceRepository.findByRoomId(roomId).stream()
            .collect(java.util.stream.Collectors.toMap(
                MonitorDevice::getDeviceId,
                d -> d,
                (left, right) -> left
            ));
        List<DeviceSchedule> schedules = deviceScheduleRepository.findByRoomId(roomId).stream()
            .toList();
        if (!schedules.isEmpty() && schedules.stream().noneMatch(s -> Boolean.TRUE.equals(s.getActive()))) {
            publishDisabledScheduleForRoom(roomId);
            return;
        }

        Map<String, String> partsByKey = new LinkedHashMap<>();
        for (String key : List.of("t", "h", "l")) {
            partsByKey.put(key, key + "=" + SCHEDULE_DEFAULT_RANGE);
        }

        schedules.stream()
            .sorted(Comparator.comparing(DeviceSchedule::getId))
            .forEach(schedule -> {
                MonitorDevice device = devicesById.get(schedule.getDeviceId());
                String key = device == null ? null : scheduleKeyForConnectKey(device.getConnectKey());
                if (key == null) return;

                String range = Boolean.FALSE.equals(schedule.getActive())
                    ? SCHEDULE_DISABLED_RANGE
                    : scheduleRangeForFeed(schedule);
                partsByKey.put(key, key + "=" + range);
            });

        StringJoiner joiner = new StringJoiner(",");
        for (String key : List.of("t", "h", "l")) {
            String part = partsByKey.get(key);
            if (part != null) joiner.add(part);
        }

        String value = roomCode + ":" + joiner;
        publish("schedule", value);
        log.info("[schedule] Published room={} value={}", roomId, value);
    }

    public void publishDisabledScheduleForRoom(int roomId) {
        String value = resolveRoomCode(roomId)
            + ":t=" + SCHEDULE_DISABLED_RANGE
            + ",h=" + SCHEDULE_DISABLED_RANGE
            + ",l=" + SCHEDULE_DISABLED_RANGE;
        publish("schedule", value);
        log.info("[schedule] Published disabled room={} value={}", roomId, value);
    }

    private String scheduleKeyForConnectKey(String connectKey) {
        if (connectKey == null) return null;
        return switch (connectKey) {
            case "temp-fan" -> "t";
            case "humi-fan" -> "h";
            case "light" -> "l";
            default -> null;
        };
    }

    private String formatScheduleTime(LocalTime time) {
        return time == null ? "00:00" : time.format(SCHEDULE_TIME_FORMAT);
    }

    private String scheduleRangeForFeed(DeviceSchedule schedule) {
        String action = schedule.getAction();
        if ("ONLY_ON".equalsIgnoreCase(action)) {
            return formatScheduleTime(schedule.getStartTime()) + "-23:59";
        }

        if ("ONLY_OFF".equalsIgnoreCase(action) || "OFF".equalsIgnoreCase(action)) {
            return "00:00-" + formatScheduleTime(schedule.getStartTime());
        }

        return formatScheduleTime(schedule.getStartTime()) + "-" + formatScheduleTime(schedule.getEndTime());
    }

    private String[] splitScheduleRange(String value) {
        String normalized = value == null ? "" : value.trim();
        String[] times = normalized.contains("-")
            ? normalized.split("-")
            : normalized.split("\\s+");
        if (times.length != 2) return null;
        return new String[] { times[0].trim(), times[1].trim() };
    }

    private LocalTime parseScheduleTime(String value) {
        String normalized = value.trim();
        return normalized.contains(":")
            ? LocalTime.parse(normalized)
            : LocalTime.parse(normalized, COMPACT_SCHEDULE_TIME_FORMAT);
    }

    private boolean isScheduleRange(String startTime, String endTime, String range) {
        String[] expected = splitScheduleRange(range);
        if (expected == null) return false;
        return normalizeScheduleToken(startTime).equals(normalizeScheduleToken(expected[0]))
            && normalizeScheduleToken(endTime).equals(normalizeScheduleToken(expected[1]));
    }

    private String normalizeScheduleToken(String value) {
        return value == null ? "" : value.trim().replace(":", "");
    }

    /**
     * Publish threshold: "A1:t={tVal},h={hVal}"
     */
    public void publishThreshold(int roomId, double tempThr, double humiThr) {
        String value = "A" + roomId + ":t=" + (int) tempThr + ",h=" + (int) humiThr;
        publish("threshold", value);
    }

    /**
     * Publish sensor-data (dùng khi backend muốn ghi đè, thường Yolobit tự gửi).
     */
    public void publishSensorData(int roomId, double temp, double humi) {
        String value = "r" + roomId + ":t=" + (int) temp + ",h=" + (int) humi;
        publish("sensor-data", value);
    }

    // ── Parser ────────────────────────────────────────────────────────────────

    /**
     * Parse payload:
     *   Format cũ: "r1:t=25,h=50"
     *   Format mới: "A1:t=25,h=50" hoặc "A1:t=25,h=50,l=80,m=1"
     *   t=nhiệt độ, h=độ ẩm, l=ánh sáng(0-100), m=chuyển động(0/1)
     */
    private ParsedRoom parseRoomPayload(String payload) {
        try {
            int colonIdx = payload.indexOf(':');
            String roomCode = payload.substring(0, colonIdx).trim();
            String rest = payload.substring(colonIdx + 1);

            // Parse tất cả key=value
            java.util.Map<String, Double> values = new java.util.HashMap<>();
            for (String part : rest.split(",")) {
                String[] kv = part.split("=");
                if (kv.length == 2) {
                    try { values.put(kv[0].trim().toLowerCase(), Double.parseDouble(kv[1].trim())); }
                    catch (NumberFormatException ignored) {}
                }
            }

            double t = values.getOrDefault("t", 0.0);
            double h = values.getOrDefault("h", 0.0);
            double l = values.getOrDefault("l", -1.0); // -1 = không có
            int    m = values.containsKey("m") ? (int) Math.round(values.get("m")) : -1; // -1 = không có

            int roomId;
            if (roomCode.toLowerCase().startsWith("r") && roomCode.substring(1).matches("\\d+")) {
                roomId = Integer.parseInt(roomCode.substring(1));
            } else {
                String zoneLetter = roomCode.replaceAll("\\d", "").toUpperCase();
                int roomIndex = Integer.parseInt(roomCode.replaceAll("[^\\d]", ""));
                String zoneSearch = "KHU " + zoneLetter;
                Integer foundRoomId = storageZoneRepository.findAll().stream()
                    .filter(z -> z.getAreaName() != null && z.getAreaName().toUpperCase().contains(zoneSearch))
                    .findFirst()
                    .map(zone -> {
                        java.util.List<com.example.demo.entity.StorageRoom> rooms =
                            storageRoomRepository.findByAreaId(zone.getAreaId());
                        rooms.sort(java.util.Comparator.comparing(com.example.demo.entity.StorageRoom::getRoomId));
                        return roomIndex <= rooms.size() ? rooms.get(roomIndex - 1).getRoomId() : null;
                    })
                    .orElse(null);

                if (foundRoomId == null) {
                    log.warn("Không tìm thấy phòng cho mã: {} (zoneSearch={})", roomCode, zoneSearch);
                    return null;
                }
                roomId = foundRoomId;
            }

            log.info("Parse payload '{}' → roomId={} t={} h={} l={} m={}", payload, roomId, t, h, l, m);
            return new ParsedRoom(roomId, t, h, l, m);
        } catch (Exception e) {
            log.warn("Cannot parse payload: {} — {}", payload, e.getMessage());
            return null;
        }
    }

    private record ParsedRoom(int roomId, double t, double h, double light, int motion) {}

    // ── Helper ────────────────────────────────────────────────────────────────

    private void saveLog(String typeAction, String description, Integer deviceId) {
        DeviceLog entry = new DeviceLog();
        entry.setDeviceId(deviceId);
        entry.setTypeAction(typeAction);
        entry.setDescription(description);
        entry.setTimestamp(LocalDateTime.now());
        deviceLogRepository.save(entry);
    }

    @PreDestroy
    public void disconnect() {
        try {
            if (mqttClient != null && mqttClient.isConnected()) mqttClient.disconnect();
        } catch (MqttException e) {
            log.error("Disconnect error: {}", e.getMessage());
        }
    }
}
