package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "user_issue_report")
public class UserIssueReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "report_id")
    private Integer reportId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private String category; // SENSOR, FAN, TEMPERATURE, HUMIDITY, DOOR, CAMERA, OTHER

    @Column(name = "room_id")
    private Integer roomId;

    @Column(name = "reported_by")
    private UUID reportedBy;

    @Column(nullable = false)
    private String status; // OPEN, IN_PROGRESS, RESOLVED

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    private String note;
}
