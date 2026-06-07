package com.example.demo.config;

import com.example.demo.entity.*;
import com.example.demo.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final StorageZoneRepository zoneRepository;
    private final StorageRoomRepository roomRepository;
    private final SensorDeviceRepository sensorRepository;
    private final MonitorDeviceRepository monitorRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        seedRolesAndUsers();
        seedZonesAndRooms();
        seedDevices();
    }

    // ── Roles & Users ─────────────────────────────────────────────────────────

    private void seedRolesAndUsers() {
        Role adminRole  = seedRole("ADMIN");
        Role staffRole  = seedRole("STAFF");
        Role maintRole  = seedRole("MAINTENANCE");

        seedUser("admin",      "admin123",    "Admin",   "System", "admin@freshguard.vn",      adminRole);
        seedUser("staff01",    "staff123",    "Nguyễn",  "Văn A",  "staff01@freshguard.vn",    staffRole);
        seedUser("maintain01", "maintain123", "Trần",    "Thị B",  "maintain01@freshguard.vn", maintRole);

        log.info("✓ Roles & Users seeded");
    }

    // ── Zones & Rooms ─────────────────────────────────────────────────────────

    private void seedZonesAndRooms() {
        if (zoneRepository.count() > 0) {
            log.info("✓ Zones already exist, skipping");
            return;
        }

        // Khu vực A - Hải sản
        StorageZone zoneA = seedZone("Khu vực A - Hải sản & Thủy sản", "Tầng 1 - Kho đông");
        StorageRoom r1 = seedRoom("Phòng 1 - Hải sản tươi sống", 78,  zoneA);
        StorageRoom r2 = seedRoom("Phòng 2 - Hải sản đông lạnh", 55,  zoneA);
        StorageRoom r3 = seedRoom("Phòng 3 - Thủy sản chế biến", 52,  zoneA);

        // Khu vực B - Thịt
        StorageZone zoneB = seedZone("Khu vực B - Thịt & Gia cầm", "Tầng 1 - Kho lạnh");
        StorageRoom r4 = seedRoom("Phòng 1 - Thịt bò & heo",  91, zoneB);
        StorageRoom r5 = seedRoom("Phòng 2 - Thịt gia cầm",   70, zoneB);

        // Khu vực C - Rau củ
        StorageZone zoneC = seedZone("Khu vực C - Rau củ & Trái cây", "Tầng 2 - Kho mát");
        StorageRoom r6 = seedRoom("Phòng 1 - Rau củ quả",         62, zoneC);
        StorageRoom r7 = seedRoom("Phòng 2 - Trái cây nhiệt đới", 45, zoneC);
        StorageRoom r8 = seedRoom("Phòng 3 - Trái cây xuất khẩu", 40, zoneC);

        log.info("✓ Zones & Rooms seeded (3 zones, 8 rooms)");
    }

    // ── Sensors & Monitor Devices ─────────────────────────────────────────────

    private void seedDevices() {
        if (sensorRepository.count() > 0) {
            log.info("✓ Devices already exist, skipping");
            return;
        }

        roomRepository.findAll().forEach(room -> {
            String name = room.getName();
            int rid = room.getRoomId();
            switch (name) {
                case "Phòng 1 - Hải sản tươi sống" -> {
                    seedSensor("SENSOR-001-A", "Cảm biến nhiệt độ A1", -18.5, 85.0, rid);
                    seedSensor("SENSOR-001-B", "Cảm biến độ ẩm A2",      0.0, 85.0, rid);
                    seedMonitor("CTRL-001-A",  "Máy nén lạnh A1",   rid);
                    seedMonitor("CTRL-002-A",  "Quạt thông gió A1", rid);
                }
                case "Phòng 2 - Hải sản đông lạnh" -> {
                    seedSensor("SENSOR-002-A", "Cảm biến nhiệt độ EA1", -25.0, 80.0, rid);
                    seedSensor("SENSOR-002-B", "Cảm biến độ ẩm EA2",      0.0, 80.0, rid);
                    seedMonitor("CTRL-003-A",  "Máy nén lạnh EA1", rid);
                    seedMonitor("CTRL-004-A",  "Quạt gió EA1",     rid);
                }
                case "Phòng 3 - Thủy sản chế biến" -> {
                    seedSensor("SENSOR-003-A", "Cảm biến nhiệt độ IB1", -15.0, 82.0, rid);
                    seedSensor("SENSOR-003-B", "Cảm biến độ ẩm IB2",      0.0, 82.0, rid);
                    seedMonitor("CTRL-005-A",  "Máy nén lạnh IB1", rid);
                }
                case "Phòng 1 - Thịt bò & heo" -> {
                    seedSensor("SENSOR-004-A", "Cảm biến nhiệt độ C1", -2.1, 82.0, rid);
                    seedSensor("SENSOR-004-B", "Cảm biến độ ẩm C2",    0.0, 82.0, rid);
                    seedMonitor("CTRL-006-A",  "Đèn UV khử khuẩn C1", rid);
                }
                case "Phòng 2 - Thịt gia cầm" -> {
                    seedSensor("SENSOR-005-A", "Cảm biến nhiệt độ FB1", -3.0, 78.0, rid);
                    seedSensor("SENSOR-005-B", "Cảm biến độ ẩm FB2",    0.0, 78.0, rid);
                    seedMonitor("CTRL-007-A",  "Máy làm lạnh FB1", rid);
                }
                case "Phòng 1 - Rau củ quả" -> {
                    seedSensor("SENSOR-006-A", "Cảm biến nhiệt độ B1", 4.2,   90.0, rid);
                    seedSensor("SENSOR-006-B", "Cảm biến CO2 B1",      450.0, 90.0, rid);
                    seedMonitor("CTRL-008-A",  "Máy làm lạnh B1", rid);
                }
                case "Phòng 2 - Trái cây nhiệt đới" -> {
                    seedSensor("SENSOR-007-A", "Cảm biến nhiệt độ HA1", 8.3, 88.0, rid);
                    seedMonitor("CTRL-009-A",  "Quạt làm mát HA1", rid);
                }
                case "Phòng 3 - Trái cây xuất khẩu" -> {
                    seedSensor("SENSOR-008-A", "Cảm biến nhiệt độ XK1", 6.0, 85.0, rid);
                    seedSensor("SENSOR-008-B", "Cảm biến độ ẩm XK2",    0.0, 85.0, rid);
                    seedMonitor("CTRL-010-A",  "Máy làm lạnh XK1", rid);
                }
                default -> {}
            }
        });

        log.info("✓ Devices seeded (8 rooms fully equipped)");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Role seedRole(String name) {
        return roleRepository.findByRoleName(name).orElseGet(() -> {
            log.info("  + Role: {}", name);
            return roleRepository.save(new Role(name));
        });
    }

    private void seedUser(String username, String rawPw, String firstName,
                          String lastName, String email, Role role) {
        if (!userRepository.existsByUsername(username)) {
            User u = new User();
            u.setUsername(username);
            u.setPassword(passwordEncoder.encode(rawPw));
            u.setFirstName(firstName);
            u.setLastName(lastName);
            u.setEmail(email);
            u.setRole(role);
            userRepository.save(u);
            log.info("  + User: {} ({})", username, role.getRoleName());
        }
    }

    private StorageZone seedZone(String name, String location) {
        StorageZone z = new StorageZone();
        z.setAreaName(name);
        z.setLocation(location);
        return zoneRepository.save(z);
    }

    private StorageRoom seedRoom(String name, double maxVolume, StorageZone zone) {
        StorageRoom r = new StorageRoom();
        r.setName(name);
        r.setAreaId(zone.getAreaId());
        r.setMaxVolume(maxVolume);
        r.setCurrentVolume(0d);
        return roomRepository.save(r);
    }

    private void seedSensor(String connectKey, String name, double temp, double humi, int roomId) {
        SensorDevice s = new SensorDevice();
        s.setConnectKey(connectKey);
        s.setName(name);
        s.setStatus("online");
        s.setTemperature(temp);
        s.setHumidity(humi);
        s.setInstallDate(LocalDate.now());
        s.setRoomId(roomId);
        sensorRepository.save(s);
    }

    private void seedMonitor(String connectKey, String name, int roomId) {
        MonitorDevice m = new MonitorDevice();
        m.setConnectKey(connectKey);
        m.setName(name);
        m.setStatus("online");
        m.setMode("MANUAL");
        m.setInstallDate(LocalDate.now());
        m.setRoomId(roomId);
        monitorRepository.save(m);
    }
}
