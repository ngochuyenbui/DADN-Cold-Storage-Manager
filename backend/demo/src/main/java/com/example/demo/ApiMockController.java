package com.example.demo;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiMockController {

    private final ConcurrentHashMap<Integer, MonitorDevice> monitorDevices = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, SensorDeviceData> sensorDataByDevice = new ConcurrentHashMap<>();

    public ApiMockController() {
        monitorDevices.put(1, new MonitorDevice(
                1,
                "Main Monitor",
                "humi-fan",
                "AUTO",
                "OFF",
                0,
                0
        ));
    }

    @GetMapping("/monitor-devices")
    public Map<String, Object> listMonitorDevices() {
        List<Map<String, Object>> data = new ArrayList<>();
        for (MonitorDevice device : monitorDevices.values()) {
            data.add(device.toMap());
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", data);
        return response;
    }

    @GetMapping("/monitor-devices/{deviceId}")
    public ResponseEntity<Map<String, Object>> getMonitorDevice(@PathVariable int deviceId) {
        MonitorDevice device = monitorDevices.get(deviceId);
        if (device == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("Monitor device not found"));
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", device.toMap());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/monitor-devices/{deviceId}/control")
    public ResponseEntity<Map<String, Object>> updateMonitorControl(@PathVariable int deviceId, @RequestBody Map<String, Object> payload) {
        MonitorDevice existing = monitorDevices.get(deviceId);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("Monitor device not found"));
        }

        MonitorDevice updated = existing.applyControl(payload);
        monitorDevices.put(deviceId, updated);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", updated.toMap());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/sensor-devices/{deviceId}/data")
    public Map<String, Object> updateSensorData(@PathVariable int deviceId, @RequestBody Map<String, Object> payload) {
        SensorDeviceData data = SensorDeviceData.from(deviceId, payload);
        sensorDataByDevice.put(deviceId, data);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", data.toMap());
        return response;
    }

    @GetMapping("/sensor-devices/{deviceId}/data")
    public ResponseEntity<Map<String, Object>> getSensorData(@PathVariable int deviceId) {
        SensorDeviceData data = sensorDataByDevice.get(deviceId);
        if (data == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("Sensor data not found"));
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("data", data.toMap());
        return ResponseEntity.ok(response);
    }

    private static Map<String, Object> error(String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("error", message);
        return response;
    }

    static class MonitorDevice {
        private final int deviceId;
        private final String name;
        private final String connectKey;
        private final String mode;
        private final String status;
        private final int speed;
        private final double value;

        MonitorDevice(int deviceId, String name, String connectKey, String mode, String status, int speed, double value) {
            this.deviceId = deviceId;
            this.name = name;
            this.connectKey = connectKey;
            this.mode = mode;
            this.status = status;
            this.speed = speed;
            this.value = value;
        }

        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("deviceId", deviceId);
            map.put("name", name);
            map.put("connectKey", connectKey);
            map.put("mode", mode);
            map.put("status", status);
            map.put("speed", speed);
            map.put("value", value);
            return map;
        }

        MonitorDevice applyControl(Map<String, Object> payload) {
            String updatedName = readString(payload.get("name"), name);
            String updatedConnectKey = readString(payload.get("connectKey"), connectKey);
            String updatedMode = readString(payload.get("mode"), mode);
            String updatedStatus = readString(payload.get("status"), status).toUpperCase();
            Integer updatedSpeed = readInteger(payload.get("speed"), speed);
            Double updatedValue = readDouble(payload.get("value"), value);

            return new MonitorDevice(
                    deviceId,
                    updatedName,
                    updatedConnectKey,
                    updatedMode,
                    updatedStatus,
                    updatedSpeed,
                    updatedValue
            );
        }

        private static String readString(Object value, String defaultValue) {
            if (value == null) {
                return defaultValue;
            }
            String text = String.valueOf(value).trim();
            return text.isEmpty() ? defaultValue : text;
        }

        private static Integer readInteger(Object value, Integer defaultValue) {
            if (value == null) {
                return defaultValue;
            }
            if (value instanceof Number number) {
                return number.intValue();
            }
            try {
                return Integer.parseInt(String.valueOf(value).trim());
            } catch (NumberFormatException ex) {
                return defaultValue;
            }
        }

        private static Double readDouble(Object value, Double defaultValue) {
            if (value == null) {
                return defaultValue;
            }
            if (value instanceof Number number) {
                return number.doubleValue();
            }
            try {
                return Double.parseDouble(String.valueOf(value).trim());
            } catch (NumberFormatException ex) {
                return defaultValue;
            }
        }
    }

    static class SensorDeviceData {
        private final int deviceId;
        private final String status;
        private final Double temperature;
        private final Double humidity;
        private final String lastUpdated;

        SensorDeviceData(int deviceId, String status, Double temperature, Double humidity, String lastUpdated) {
            this.deviceId = deviceId;
            this.status = status;
            this.temperature = temperature;
            this.humidity = humidity;
            this.lastUpdated = lastUpdated;
        }

        static SensorDeviceData from(int deviceId, Map<String, Object> payload) {
            String status = readString(payload.get("status"), "ON");
            Double temperature = readDouble(payload.get("temperature"));
            Double humidity = readDouble(payload.get("humidity"));
            String lastUpdated = readString(payload.get("lastUpdated"), OffsetDateTime.now().toString());
            return new SensorDeviceData(deviceId, status, temperature, humidity, lastUpdated);
        }

        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("deviceId", deviceId);
            map.put("status", status);
            map.put("temperature", temperature);
            map.put("humidity", humidity);
            map.put("lastUpdated", lastUpdated);
            return map;
        }

        private static String readString(Object value, String defaultValue) {
            if (value == null) {
                return defaultValue;
            }
            String text = String.valueOf(value).trim();
            return text.isEmpty() ? defaultValue : text;
        }

        private static Double readDouble(Object value) {
            if (value == null) {
                return null;
            }
            if (value instanceof Number number) {
                return number.doubleValue();
            }
            try {
                return Double.parseDouble(String.valueOf(value).trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
    }
}
