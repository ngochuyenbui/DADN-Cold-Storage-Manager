package com.example.demo.repository;

import com.example.demo.entity.DeviceLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface DeviceLogRepository extends JpaRepository<DeviceLog, Integer> {

    List<DeviceLog> findTop50ByDeviceIdOrderByTimestampDesc(Integer deviceId);

    Page<DeviceLog> findByDeviceIdOrderByTimestampDesc(Integer deviceId, Pageable pageable);

    Page<DeviceLog> findByTypeActionOrderByTimestampDesc(String typeAction, Pageable pageable);

    Page<DeviceLog> findAllByOrderByTimestampDesc(Pageable pageable);

    @Query("SELECT d FROM DeviceLog d WHERE d.typeAction = :typeAction AND d.timestamp >= :from ORDER BY d.timestamp ASC")
    List<DeviceLog> findSensorHistory(@Param("typeAction") String typeAction, @Param("from") LocalDateTime from);
}
