package com.example.demo.repository;

import com.example.demo.entity.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface AlertRepository extends JpaRepository<Alert, Integer> {
    List<Alert> findByStatusOrderByTimeDesc(String status);
    List<Alert> findByRoomIdAndTypeAndStatus(Integer roomId, String type, String status);

    @Query("SELECT a FROM Alert a ORDER BY a.time DESC")
    List<Alert> findAllOrderByTimeDesc();

    @Query("SELECT a FROM Alert a WHERE a.status = 'ACTIVE' AND a.roomId = :roomId AND a.type = :type ORDER BY a.time DESC")
    Optional<Alert> findLatestActive(@Param("roomId") Integer roomId, @Param("type") String type);

    // Fallback: tìm alert ACTIVE theo message chứa keyword (cho alert cũ không có type/roomId)
    @Query("SELECT a FROM Alert a WHERE a.status = 'ACTIVE' AND (a.message LIKE %:keyword%) ORDER BY a.time DESC")
    List<Alert> findActiveByMessageContaining(@Param("keyword") String keyword);
}
