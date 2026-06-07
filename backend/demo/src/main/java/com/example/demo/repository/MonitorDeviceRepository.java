package com.example.demo.repository;

import com.example.demo.entity.MonitorDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MonitorDeviceRepository extends JpaRepository<MonitorDevice, Integer> {
    Optional<MonitorDevice> findByConnectKey(String connectKey);
    List<MonitorDevice> findByRoomId(Integer roomId);
}
