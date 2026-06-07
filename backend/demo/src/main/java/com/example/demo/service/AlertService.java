package com.example.demo.service;

import com.example.demo.entity.Alert;
import com.example.demo.repository.AlertRepository;
import com.example.demo.repository.StorageRoomRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    private final AlertRepository alertRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final AlertEmailService alertEmailService;
    private final StorageRoomRepository roomRepository;

    private String getRoomName(int roomId) {
        return roomRepository.findById(roomId)
            .map(r -> r.getName())
            .orElse("Phong " + roomId);
    }

    public void checkAndAlert(int roomId, double temp, double humi,
                               double tempThreshold, double humiThreshold) {
        try {
            log.info("checkAndAlert room={} temp={}/{} humi={}/{}", roomId, temp, tempThreshold, humi, humiThreshold);
            boolean tempOk = temp <= tempThreshold;
            boolean humiOk = humi <= humiThreshold;
            String roomName = getRoomName(roomId);

            if (!tempOk) {
                boolean alreadyActive = alertRepository.findLatestActive(roomId, "TEMP_HIGH").isPresent();
                if (!alreadyActive) {
                    String msg = roomName + ": Nhi\u1ec7t \u0111\u1ed9 " + temp + "\u00b0C v\u01b0\u1ee3t ng\u01b0\u1ee1ng " + tempThreshold + "\u00b0C";
                    createAlert(roomId, "TEMP_HIGH", msg);
                }
            } else {
                Optional<Alert> active = alertRepository.findLatestActive(roomId, "TEMP_HIGH");
                if (active.isEmpty()) {
                    active = alertRepository.findActiveByMessageContaining(roomName + ": Nhiet do").stream().findFirst();
                }
                String resolveMsg = "Nhi\u1ec7t \u0111\u1ed9 " + roomName + " \u0111\u00e3 tr\u1edf v\u1ec1 b\u00ecnh th\u01b0\u1eddng (" + temp + "\u00b0C)";
                active.ifPresent(a -> autoResolve(a, resolveMsg));
            }

            if (!humiOk) {
                boolean alreadyActive = alertRepository.findLatestActive(roomId, "HUMI_HIGH").isPresent();
                if (!alreadyActive) {
                    String msg = roomName + ": \u0110\u1ed9 \u1ea9m " + humi + "% v\u01b0\u1ee3t ng\u01b0\u1ee1ng " + humiThreshold + "%";
                    createAlert(roomId, "HUMI_HIGH", msg);
                }
            } else {
                Optional<Alert> active = alertRepository.findLatestActive(roomId, "HUMI_HIGH");
                if (active.isEmpty()) {
                    active = alertRepository.findActiveByMessageContaining(roomName + ": Do am").stream().findFirst();
                }
                String resolveMsg = "\u0110\u1ed9 \u1ea9m " + roomName + " \u0111\u00e3 tr\u1edf v\u1ec1 b\u00ecnh th\u01b0\u1eddng (" + humi + "%)";
                active.ifPresent(a -> autoResolve(a, resolveMsg));
            }
        } catch (Exception e) {
            log.error("checkAndAlert error room={}: {}", roomId, e.getMessage(), e);
        }
    }

    private void createAlert(int roomId, String type, String message) {
        Alert alert = new Alert();
        alert.setMessage(message);
        alert.setStatus("ACTIVE");
        alert.setType(type);
        alert.setRoomId(roomId);
        alert.setTime(LocalDateTime.now());
        alertRepository.save(alert);
        messagingTemplate.convertAndSend("/topic/alerts", Map.of(
            "alertId", alert.getAlertId(), "message", message,
            "type", type, "roomId", roomId,
            "status", "ACTIVE", "time", alert.getTime().toString()
        ));
        alertEmailService.sendAlertEmail(type, message);
        log.warn("ALERT [{}] room={}: {}", type, roomId, message);
    }

    private void autoResolve(Alert alert, String resolveMessage) {
        alert.setStatus("RESOLVED");
        alert.setResolvedAt(LocalDateTime.now());
        alert.setResolvedBy("AUTO");
        alertRepository.save(alert);
        messagingTemplate.convertAndSend("/topic/alerts", Map.of(
            "alertId", alert.getAlertId(), "status", "RESOLVED",
            "resolvedBy", "AUTO", "message", resolveMessage
        ));
        alertEmailService.sendResolvedEmail(alert.getType(), resolveMessage);
        log.info("AUTO-RESOLVED alert#{} room={}: {}", alert.getAlertId(), alert.getRoomId(), resolveMessage);
    }

    public void resolve(Integer alertId) {
        alertRepository.findById(alertId).ifPresent(a -> {
            a.setStatus("RESOLVED");
            a.setResolvedAt(LocalDateTime.now());
            a.setResolvedBy("MANUAL");
            alertRepository.save(a);
        });
    }
}