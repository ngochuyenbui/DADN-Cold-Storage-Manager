package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "sensor_device")
public class SensorDevice {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "device_id")
    private Integer deviceId;

    @Column(name = "connect_key", nullable = false)
    private String connectKey;

    private String name;

    @Column(name = "install_date")
    private LocalDate installDate;

    private String status;
    private Double temperature;
    private Double humidity;

    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;

    @Column(name = "room_id")
    private Integer roomId;
}
