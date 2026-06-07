package com.example.demo.controller;

import com.example.demo.entity.*;
import com.example.demo.repository.*;
import com.itextpdf.text.*;
import com.itextpdf.text.pdf.*;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final AlertRepository alertRepository;
    private final DeviceLogRepository deviceLogRepository;
    private final SensorDeviceRepository sensorDeviceRepository;
    private final StorageRoomRepository storageRoomRepository;
    private final StorageZoneRepository storageZoneRepository;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DT_FMT   = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    // ── 1. TỔNG QUÁT ─────────────────────────────────────────────────────────

    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.plusDays(1).atStartOfDay();

        List<SensorDevice> allSensors = sensorDeviceRepository.findAll();
        long activeSensors   = allSensors.stream().filter(s -> "online".equalsIgnoreCase(s.getStatus())).count();
        long inactiveSensors = allSensors.size() - activeSensors;

        List<DeviceLog> tempLogs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_TEMP", fromDt), toDt);
        List<DeviceLog> humiLogs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_HUMI", fromDt), toDt);

        List<Alert> alerts = alertRepository.findAll().stream()
            .filter(a -> a.getTime() != null && a.getTime().isAfter(fromDt) && a.getTime().isBefore(toDt))
            .collect(Collectors.toList());

        DoubleSummaryStatistics tempStats = tempLogs.stream().mapToDouble(l -> parseDouble(l.getDescription())).summaryStatistics();
        DoubleSummaryStatistics humiStats = humiLogs.stream().mapToDouble(l -> parseDouble(l.getDescription())).summaryStatistics();

        return ResponseEntity.ok(Map.of(
            "period",       Map.of("from", from.format(DATE_FMT), "to", to.format(DATE_FMT)),
            "sensors",      Map.of("total", allSensors.size(), "active", activeSensors, "inactive", inactiveSensors),
            "temperature",  statsMap(tempStats),
            "humidity",     statsMap(humiStats),
            "alerts",       Map.of(
                "total",    alerts.size(),
                "active",   alerts.stream().filter(a -> "ACTIVE".equals(a.getStatus())).count(),
                "resolved", alerts.stream().filter(a -> "RESOLVED".equals(a.getStatus())).count()
            )
        ));
    }

    // ── 2. THEO KHU ──────────────────────────────────────────────────────────

    @GetMapping("/by-zone")
    public ResponseEntity<?> byZone(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.plusDays(1).atStartOfDay();

        List<StorageZone> zones = storageZoneRepository.findAll();
        List<Map<String, Object>> result = new ArrayList<>();

        for (StorageZone zone : zones) {
            List<StorageRoom> rooms = storageRoomRepository.findByAreaId(zone.getAreaId());
            List<Integer> roomIds = rooms.stream().map(StorageRoom::getRoomId).collect(Collectors.toList());

            List<SensorDevice> sensors = sensorDeviceRepository.findAll().stream()
                .filter(s -> s.getRoomId() != null && roomIds.contains(s.getRoomId()))
                .collect(Collectors.toList());

            long activeSensors = sensors.stream().filter(s -> "online".equalsIgnoreCase(s.getStatus())).count();

            List<Double> temps = sensors.stream()
                .filter(s -> s.getTemperature() != null).map(SensorDevice::getTemperature).collect(Collectors.toList());
            List<Double> humis = sensors.stream()
                .filter(s -> s.getHumidity() != null).map(SensorDevice::getHumidity).collect(Collectors.toList());

            Map<String, Object> zoneData = new LinkedHashMap<>();
            zoneData.put("areaId",   zone.getAreaId());
            zoneData.put("areaName", zone.getAreaName());
            zoneData.put("location", zone.getLocation());
            zoneData.put("roomCount", rooms.size());
            zoneData.put("sensorCount", sensors.size());
            zoneData.put("activeSensors", activeSensors);
            zoneData.put("avgTemperature", temps.isEmpty() ? null : round(temps.stream().mapToDouble(d -> d).average().orElse(0)));
            zoneData.put("avgHumidity",    humis.isEmpty() ? null : round(humis.stream().mapToDouble(d -> d).average().orElse(0)));
            result.add(zoneData);
        }

        return ResponseEntity.ok(result);
    }

    // ── 2b. CHART HISTORY (nhiệt độ/độ ẩm theo ngày) ─────────────────────────

    @GetMapping("/chart-history")
    public ResponseEntity<?> chartHistory(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer roomId) {

        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.plusDays(1).atStartOfDay();

        List<SensorDevice> sensors = roomId != null
            ? sensorDeviceRepository.findByRoomId(roomId)
            : sensorDeviceRepository.findAll();
        Set<Integer> sensorIds = sensors.stream().map(SensorDevice::getDeviceId).collect(Collectors.toSet());

        List<DeviceLog> tempLogs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_TEMP", fromDt), toDt)
            .stream().filter(l -> sensorIds.contains(l.getDeviceId())).collect(Collectors.toList());
        List<DeviceLog> humiLogs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_HUMI", fromDt), toDt)
            .stream().filter(l -> sensorIds.contains(l.getDeviceId())).collect(Collectors.toList());

        // Group by date → avg per day
        java.time.format.DateTimeFormatter dayFmt = java.time.format.DateTimeFormatter.ofPattern("dd/MM");
        Map<String, List<Double>> tempByDay = new java.util.TreeMap<>();
        Map<String, List<Double>> humiByDay = new java.util.TreeMap<>();

        tempLogs.forEach(l -> tempByDay.computeIfAbsent(l.getTimestamp().format(dayFmt), k -> new ArrayList<>()).add(parseDouble(l.getDescription())));
        humiLogs.forEach(l -> humiByDay.computeIfAbsent(l.getTimestamp().format(dayFmt), k -> new ArrayList<>()).add(parseDouble(l.getDescription())));

        // Merge all days
        Set<String> allDays = new java.util.TreeSet<>();
        allDays.addAll(tempByDay.keySet());
        allDays.addAll(humiByDay.keySet());

        List<Map<String, Object>> points = allDays.stream().map(day -> {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("day", day);
            List<Double> temps = tempByDay.getOrDefault(day, List.of());
            List<Double> humis = humiByDay.getOrDefault(day, List.of());
            p.put("temp", temps.isEmpty() ? null : round(temps.stream().mapToDouble(d -> d).average().orElse(0)));
            p.put("humi", humis.isEmpty() ? null : round(humis.stream().mapToDouble(d -> d).average().orElse(0)));
            return p;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(points);
    }

    // ── 3. THEO PHÒNG ────────────────────────────────────────────────────────

    @GetMapping("/by-room")
    public ResponseEntity<?> byRoom(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer areaId) {

        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.plusDays(1).atStartOfDay();

        List<StorageRoom> rooms = areaId != null
            ? storageRoomRepository.findByAreaId(areaId)
            : storageRoomRepository.findAll();

        List<Map<String, Object>> result = new ArrayList<>();

        for (StorageRoom room : rooms) {
            List<SensorDevice> sensors = sensorDeviceRepository.findByRoomId(room.getRoomId());
            long activeSensors = sensors.stream().filter(s -> "online".equalsIgnoreCase(s.getStatus())).count();

            List<DeviceLog> tempLogs = new ArrayList<>();
            List<DeviceLog> humiLogs = new ArrayList<>();
            for (SensorDevice s : sensors) {
                filterByTime(deviceLogRepository.findSensorHistory("SENSOR_TEMP", fromDt), toDt).stream()
                    .filter(l -> Objects.equals(l.getDeviceId(), s.getDeviceId())).forEach(tempLogs::add);
                filterByTime(deviceLogRepository.findSensorHistory("SENSOR_HUMI", fromDt), toDt).stream()
                    .filter(l -> Objects.equals(l.getDeviceId(), s.getDeviceId())).forEach(humiLogs::add);
            }

            DoubleSummaryStatistics tempStats = tempLogs.stream().mapToDouble(l -> parseDouble(l.getDescription())).summaryStatistics();
            DoubleSummaryStatistics humiStats = humiLogs.stream().mapToDouble(l -> parseDouble(l.getDescription())).summaryStatistics();

            List<Map<String, Object>> sensorList = sensors.stream().map(s -> {
                Map<String, Object> sm = new LinkedHashMap<>();
                sm.put("deviceId",    s.getDeviceId());
                sm.put("name",        s.getName());
                sm.put("status",      s.getStatus());
                sm.put("temperature", s.getTemperature());
                sm.put("humidity",    s.getHumidity());
                sm.put("lastUpdated", s.getLastUpdated() != null ? s.getLastUpdated().format(DT_FMT) : null);
                sm.put("installDate", s.getInstallDate() != null ? s.getInstallDate().toString() : null);
                return sm;
            }).collect(Collectors.toList());

            Map<String, Object> roomData = new LinkedHashMap<>();
            roomData.put("roomId",       room.getRoomId());
            roomData.put("name",         room.getName());
            roomData.put("maxVolume",    room.getMaxVolume());
            roomData.put("currentVolume",room.getCurrentVolume());
            roomData.put("sensorCount",  sensors.size());
            roomData.put("activeSensors",activeSensors);
            roomData.put("temperature",  statsMap(tempStats));
            roomData.put("humidity",     statsMap(humiStats));
            roomData.put("sensors",      sensorList);
            result.add(roomData);
        }

        return ResponseEntity.ok(result);
    }

    // ── 4. EXPORT PDF ────────────────────────────────────────────────────────

    @GetMapping("/export/pdf")
    public ResponseEntity<byte[]> exportPdf(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "all") String scope,
            @RequestParam(required = false) Integer areaId,
            @RequestParam(required = false) Integer roomId) throws Exception {

        byte[] pdf = buildPdf(from, to, scope, areaId, roomId);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.attachment()
            .filename("bao-cao-" + from + "-" + to + ".pdf").build());
        return ResponseEntity.ok().headers(headers).body(pdf);
    }

    // ── 5. EXPORT CSV ────────────────────────────────────────────────────────

    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "sensors") String type,
            @RequestParam(required = false) Integer areaId,
            @RequestParam(required = false) Integer roomId) {

        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.plusDays(1).atStartOfDay();

        StringBuilder sb = new StringBuilder("\uFEFF"); // BOM for Excel UTF-8

        if ("sensors".equals(type)) {
            sb.append("Tên cảm biến,Trạng thái,Nhiệt độ (C),Độ ẩm (%),Cập nhật lần cuối,Phòng,Ngày lắp đặt\n");
            List<SensorDevice> sensors = getSensorsByScope(areaId, roomId);
            for (SensorDevice s : sensors) {
                String roomName = s.getRoomId() != null
                    ? storageRoomRepository.findById(s.getRoomId()).map(StorageRoom::getName).orElse("") : "";
                sb.append(csv(s.getName())).append(",")
                  .append(csv(s.getStatus())).append(",")
                  .append(s.getTemperature() != null ? s.getTemperature() : "").append(",")
                  .append(s.getHumidity() != null ? s.getHumidity() : "").append(",")
                  .append(s.getLastUpdated() != null ? s.getLastUpdated().format(DT_FMT) : "").append(",")
                  .append(csv(roomName)).append(",")
                  .append(s.getInstallDate() != null ? s.getInstallDate() : "").append("\n");
            }
        } else if ("temperature".equals(type)) {
            sb.append("Thời gian,Cảm biến,Phòng,Nhiệt độ (C)\n");
            List<SensorDevice> sensors = getSensorsByScope(areaId, roomId);
            List<DeviceLog> logs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_TEMP", fromDt), toDt);
            Set<Integer> sensorIds = sensors.stream().map(SensorDevice::getDeviceId).collect(Collectors.toSet());
            for (DeviceLog l : logs) {
                if (!sensorIds.contains(l.getDeviceId())) continue;
                SensorDevice s = sensors.stream().filter(x -> x.getDeviceId().equals(l.getDeviceId())).findFirst().orElse(null);
                String sName = s != null ? s.getName() : "";
                String rName = s != null && s.getRoomId() != null
                    ? storageRoomRepository.findById(s.getRoomId()).map(StorageRoom::getName).orElse("") : "";
                sb.append(l.getTimestamp().format(DT_FMT)).append(",")
                  .append(csv(sName)).append(",").append(csv(rName)).append(",")
                  .append(l.getDescription()).append("\n");
            }
        } else if ("humidity".equals(type)) {
            sb.append("Thời gian,Cảm biến,Phòng,Độ ẩm (%)\n");
            List<SensorDevice> sensors = getSensorsByScope(areaId, roomId);
            List<DeviceLog> logs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_HUMI", fromDt), toDt);
            Set<Integer> sensorIds = sensors.stream().map(SensorDevice::getDeviceId).collect(Collectors.toSet());
            for (DeviceLog l : logs) {
                if (!sensorIds.contains(l.getDeviceId())) continue;
                SensorDevice s = sensors.stream().filter(x -> x.getDeviceId().equals(l.getDeviceId())).findFirst().orElse(null);
                String sName = s != null ? s.getName() : "";
                String rName = s != null && s.getRoomId() != null
                    ? storageRoomRepository.findById(s.getRoomId()).map(StorageRoom::getName).orElse("") : "";
                sb.append(l.getTimestamp().format(DT_FMT)).append(",")
                  .append(csv(sName)).append(",").append(csv(rName)).append(",")
                  .append(l.getDescription()).append("\n");
            }
        } else if ("alerts".equals(type)) {
            sb.append("ID,Thời gian,Trạng thái,Nội dung\n");
            alertRepository.findAll().stream()
                .filter(a -> a.getTime() != null && a.getTime().isAfter(fromDt) && a.getTime().isBefore(toDt))
                .sorted(Comparator.comparing(Alert::getTime).reversed())
                .forEach(a -> sb.append(a.getAlertId()).append(",")
                    .append(a.getTime().format(DT_FMT)).append(",")
                    .append(csv(a.getStatus())).append(",")
                    .append(csv(a.getMessage())).append("\n"));
        }

        byte[] bytes = sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        headers.setContentDisposition(ContentDisposition.attachment()
            .filename("bao-cao-" + type + "-" + from + "-" + to + ".csv").build());
        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    // ── PDF Builder ───────────────────────────────────────────────────────────

    private BaseFont loadBaseFont() throws Exception {
        try (java.io.InputStream is = getClass().getResourceAsStream("/fonts/DejaVuSans.ttf")) {
            if (is == null) throw new RuntimeException("Font DejaVuSans.ttf not found in classpath");
            byte[] fontBytes = is.readAllBytes();
            return BaseFont.createFont("DejaVuSans.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED, true, fontBytes, null);
        }
    }

    private byte[] buildPdf(LocalDate from, LocalDate to, String scope, Integer areaId, Integer roomId) throws Exception {
        Document doc = new Document(PageSize.A4, 40, 40, 60, 40);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter.getInstance(doc, out);
        doc.open();

        BaseFont bf = loadBaseFont();
        Font titleFont  = new Font(bf, 16, Font.BOLD);
        Font headFont   = new Font(bf, 11, Font.BOLD);
        Font normalFont = new Font(bf, 9);
        Font smallFont  = new Font(bf, 8, Font.NORMAL, BaseColor.GRAY);

        // Title
        Paragraph title = new Paragraph("BÁO CÁO HỆ THỐNG KHO LẠNH", titleFont);
        title.setAlignment(Element.ALIGN_CENTER);
        doc.add(title);
        Paragraph period = new Paragraph("Từ " + from.format(DATE_FMT) + " đến " + to.format(DATE_FMT), smallFont);
        period.setAlignment(Element.ALIGN_CENTER);
        period.setSpacingAfter(16);
        doc.add(period);

        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toDt   = to.plusDays(1).atStartOfDay();

        if ("room".equals(scope) && roomId != null) {
            // Báo cáo theo phòng
            storageRoomRepository.findById(roomId).ifPresent(room -> {
                try { addRoomSection(doc, room, fromDt, toDt, headFont, normalFont, smallFont); }
                catch (Exception e) { throw new RuntimeException(e); }
            });
        } else if ("zone".equals(scope) && areaId != null) {
            // Báo cáo theo khu
            storageZoneRepository.findById(areaId).ifPresent(zone -> {
                try {
                    doc.add(new Paragraph("KHU: " + zone.getAreaName() + " (" + zone.getLocation() + ")", headFont));
                    doc.add(new Paragraph(" "));
                    List<StorageRoom> rooms = storageRoomRepository.findByAreaId(areaId);
                    for (StorageRoom room : rooms) {
                        addRoomSection(doc, room, fromDt, toDt, headFont, normalFont, smallFont);
                    }
                } catch (Exception e) { throw new RuntimeException(e); }
            });
        } else {
            // Báo cáo tổng quát
            List<SensorDevice> allSensors = sensorDeviceRepository.findAll();
            long active = allSensors.stream().filter(s -> "online".equalsIgnoreCase(s.getStatus())).count();

            doc.add(new Paragraph("1. TỔNG QUAN CẢM BIẾN", headFont));
            PdfPTable st = new PdfPTable(3);
            st.setWidthPercentage(70);
            st.setSpacingAfter(12);
            addCell(st, "Tổng số", headFont, BaseColor.LIGHT_GRAY);
            addCell(st, "Hoạt động", headFont, BaseColor.LIGHT_GRAY);
            addCell(st, "Không hoạt động", headFont, BaseColor.LIGHT_GRAY);
            addCell(st, String.valueOf(allSensors.size()), normalFont, null);
            addCell(st, String.valueOf(active), normalFont, null);
            addCell(st, String.valueOf(allSensors.size() - active), normalFont, null);
            doc.add(st);

            List<DeviceLog> tempLogs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_TEMP", fromDt), toDt);
            List<DeviceLog> humiLogs = filterByTime(deviceLogRepository.findSensorHistory("SENSOR_HUMI", fromDt), toDt);
            doc.add(new Paragraph("2. THỐNG KÊ NHIỆT ĐỘ", headFont));
            doc.add(buildStatsTable(tempLogs, "C", normalFont));
            doc.add(new Paragraph("3. THỐNG KÊ ĐỘ ẨM", headFont));
            doc.add(buildStatsTable(humiLogs, "%", normalFont));

            List<Alert> alerts = alertRepository.findAll().stream()
                .filter(a -> a.getTime() != null && a.getTime().isAfter(fromDt) && a.getTime().isBefore(toDt))
                .sorted(Comparator.comparing(Alert::getTime).reversed()).collect(Collectors.toList());
            doc.add(new Paragraph("4. CẢNH BÁO (" + alerts.size() + ")", headFont));
            if (alerts.isEmpty()) {
                doc.add(new Paragraph("Không có cảnh báo.", normalFont));
            } else {
                PdfPTable at = new PdfPTable(3);
                at.setWidthPercentage(100);
                at.setWidths(new float[]{3, 2, 5});
                addCell(at, "Thời gian", headFont, BaseColor.LIGHT_GRAY);
                addCell(at, "Trạng thái", headFont, BaseColor.LIGHT_GRAY);
                addCell(at, "Nội dung", headFont, BaseColor.LIGHT_GRAY);
                for (Alert a : alerts) {
                    addCell(at, a.getTime().format(DT_FMT), normalFont, null);
                    addCell(at, a.getStatus(), normalFont, null);
                    addCell(at, a.getMessage() != null ? a.getMessage() : "", normalFont, null);
                }
                doc.add(at);
            }

            // Danh sách khu
            doc.add(new Paragraph("\n5. DANH SÁCH KHU VÀ PHÒNG", headFont));
            List<StorageZone> zones = storageZoneRepository.findAll();
            for (StorageZone zone : zones) {
                doc.add(new Paragraph("  Khu: " + zone.getAreaName(), new Font(bf, 10, Font.BOLD)));
                List<StorageRoom> rooms = storageRoomRepository.findByAreaId(zone.getAreaId());
                for (StorageRoom room : rooms) {
                    List<SensorDevice> sensors = sensorDeviceRepository.findByRoomId(room.getRoomId());
                    long act = sensors.stream().filter(s -> "online".equalsIgnoreCase(s.getStatus())).count();
                    doc.add(new Paragraph("    - " + room.getName() + ": " + sensors.size() + " cảm biến (" + act + " hoạt động)", normalFont));
                }
            }
        }

        Paragraph footer = new Paragraph("\nXuất lúc: " + LocalDateTime.now().format(DT_FMT), smallFont);
        footer.setAlignment(Element.ALIGN_RIGHT);
        doc.add(footer);
        doc.close();
        return out.toByteArray();
    }

    private void addRoomSection(Document doc, StorageRoom room, LocalDateTime fromDt, LocalDateTime toDt,
                                 Font headFont, Font normalFont, Font smallFont) throws DocumentException {
        doc.add(new Paragraph("PHÒNG: " + room.getName(), headFont));
        List<SensorDevice> sensors = sensorDeviceRepository.findByRoomId(room.getRoomId());

        PdfPTable st = new PdfPTable(4);
        st.setWidthPercentage(100);
        st.setSpacingAfter(8);
        addCell(st, "Tên cảm biến", headFont, BaseColor.LIGHT_GRAY);
        addCell(st, "Trạng thái", headFont, BaseColor.LIGHT_GRAY);
        addCell(st, "Nhiệt độ (C)", headFont, BaseColor.LIGHT_GRAY);
        addCell(st, "Độ ẩm (%)", headFont, BaseColor.LIGHT_GRAY);
        for (SensorDevice s : sensors) {
            addCell(st, s.getName() != null ? s.getName() : "", normalFont, null);
            addCell(st, s.getStatus() != null ? s.getStatus() : "", normalFont, null);
            addCell(st, s.getTemperature() != null ? String.valueOf(s.getTemperature()) : "-", normalFont, null);
            addCell(st, s.getHumidity() != null ? String.valueOf(s.getHumidity()) : "-", normalFont, null);
        }
        doc.add(st);

        List<DeviceLog> tempLogs = new ArrayList<>();
        List<DeviceLog> humiLogs = new ArrayList<>();
        for (SensorDevice s : sensors) {
            filterByTime(deviceLogRepository.findSensorHistory("SENSOR_TEMP", fromDt), toDt).stream()
                .filter(l -> Objects.equals(l.getDeviceId(), s.getDeviceId())).forEach(tempLogs::add);
            filterByTime(deviceLogRepository.findSensorHistory("SENSOR_HUMI", fromDt), toDt).stream()
                .filter(l -> Objects.equals(l.getDeviceId(), s.getDeviceId())).forEach(humiLogs::add);
        }
        doc.add(new Paragraph("  Nhiệt độ:", headFont));
        doc.add(buildStatsTable(tempLogs, "C", normalFont));
        doc.add(new Paragraph("  Độ ẩm:", headFont));
        doc.add(buildStatsTable(humiLogs, "%", normalFont));
        doc.add(new Paragraph(" "));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<SensorDevice> getSensorsByScope(Integer areaId, Integer roomId) {
        if (roomId != null) return sensorDeviceRepository.findByRoomId(roomId);
        if (areaId != null) {
            List<Integer> roomIds = storageRoomRepository.findByAreaId(areaId).stream()
                .map(StorageRoom::getRoomId).collect(Collectors.toList());
            return sensorDeviceRepository.findAll().stream()
                .filter(s -> s.getRoomId() != null && roomIds.contains(s.getRoomId()))
                .collect(Collectors.toList());
        }
        return sensorDeviceRepository.findAll();
    }

    private List<DeviceLog> filterByTime(List<DeviceLog> logs, LocalDateTime toDt) {
        return logs.stream().filter(l -> l.getTimestamp().isBefore(toDt)).collect(Collectors.toList());
    }

    private Map<String, Object> statsMap(DoubleSummaryStatistics stats) {
        return Map.of(
            "count", stats.getCount(),
            "min",   stats.getCount() > 0 ? round(stats.getMin()) : 0,
            "max",   stats.getCount() > 0 ? round(stats.getMax()) : 0,
            "avg",   stats.getCount() > 0 ? round(stats.getAverage()) : 0
        );
    }

    private PdfPTable buildStatsTable(List<DeviceLog> logs, String unit, Font font) throws DocumentException {
        DoubleSummaryStatistics stats = logs.stream().mapToDouble(l -> parseDouble(l.getDescription())).summaryStatistics();
        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(55);
        table.setHorizontalAlignment(Element.ALIGN_LEFT);
        table.setSpacingAfter(8);
        // dùng cùng font với normalFont (đã là DejaVuSans), chỉ bold thêm
        Font hf = new Font(font.getBaseFont(), font.getSize(), Font.BOLD);
        addCell(table, "Số mẫu đo", hf, BaseColor.LIGHT_GRAY);
        addCell(table, String.valueOf(stats.getCount()), font, null);
        addCell(table, "Thấp nhất", hf, BaseColor.LIGHT_GRAY);
        addCell(table, stats.getCount() > 0 ? round(stats.getMin()) + unit : "-", font, null);
        addCell(table, "Cao nhất", hf, BaseColor.LIGHT_GRAY);
        addCell(table, stats.getCount() > 0 ? round(stats.getMax()) + unit : "-", font, null);
        addCell(table, "Trung bình", hf, BaseColor.LIGHT_GRAY);
        addCell(table, stats.getCount() > 0 ? round(stats.getAverage()) + unit : "-", font, null);
        return table;
    }

    private void addCell(PdfPTable table, String text, Font font, BaseColor bg) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setPadding(4);
        if (bg != null) cell.setBackgroundColor(bg);
        table.addCell(cell);
    }

    private String csv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) return "\"" + s.replace("\"", "\"\"") + "\"";
        return s;
    }

    private double parseDouble(String s) {
        try { return Double.parseDouble(s); } catch (Exception e) { return 0; }
    }

    private double round(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
