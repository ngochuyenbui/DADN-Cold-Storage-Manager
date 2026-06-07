package com.example.demo.repository;

import com.example.demo.entity.SensorDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SensorDeviceRepository extends JpaRepository<SensorDevice, Integer> {
    Optional<SensorDevice> findByConnectKey(String connectKey);
    List<SensorDevice> findByRoomId(Integer roomId);
}
