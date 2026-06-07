package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@Entity
@Table(name = "device_schedule")
public class DeviceSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "device_id", nullable = false)
    private Integer deviceId;

    @Column(name = "room_id", nullable = false)
    private Integer roomId;

    @Column(nullable = false)
    private String name;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "schedule_type", nullable = false)
    private String scheduleType = "repeat"; // one_time | repeat

    @Column(name = "one_time_at")
    private LocalDateTime oneTimeAt;

    @Column(nullable = false)
    private String action = "ON"; // ON | OFF

    @Column(name = "temperature_threshold")
    private Double temperatureThreshold;

    // Comma-separated: MON,TUE,WED,THU,FRI,SAT,SUN
    @Column(name = "days_of_week", nullable = false)
    private String daysOfWeek = "MON,TUE,WED,THU,FRI,SAT,SUN";

    @Column(nullable = false)
    private Boolean active = true;

    @Column(name = "last_run_at")
    private LocalDateTime lastRunAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
