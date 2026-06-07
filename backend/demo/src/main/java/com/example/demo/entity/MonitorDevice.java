package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;

@Data
@Entity
@Table(name = "monitor_device")
public class MonitorDevice {
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
    private String mode;
    private Integer speed;
    private Double value;

    @Column(name = "room_id")
    private Integer roomId;

    @Column(name = "device_category")
    private String deviceCategory; // FAN_TEMP, FAN_HUMI, LIGHT, CAMERA, DOOR, OTHER
}
