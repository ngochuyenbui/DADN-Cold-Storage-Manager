package com.example.demo.repository;

import com.example.demo.entity.DeviceSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DeviceScheduleRepository extends JpaRepository<DeviceSchedule, Integer> {
    List<DeviceSchedule> findByRoomId(Integer roomId);
    List<DeviceSchedule> findByRoomIdAndActiveTrue(Integer roomId);
    List<DeviceSchedule> findByDeviceIdAndActiveTrue(Integer deviceId);
    List<DeviceSchedule> findByActiveTrue();
}
