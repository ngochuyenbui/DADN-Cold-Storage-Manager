package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "alert")
public class Alert {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "alert_id")
    private Integer alertId;

    private String message;
    private String status;
    private LocalDateTime time;

    @Column(name = "threshold_id")
    private Integer thresholdId;

    @Column(name = "type")
    private String type;

    @Column(name = "room_id")
    private Integer roomId;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "resolved_by")
    private String resolvedBy; // "AUTO" hoặc username
}
