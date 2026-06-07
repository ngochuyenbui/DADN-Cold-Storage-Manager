package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "device_log")
public class DeviceLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "dlog_id")
    private Integer dlogId;

    @Column(name = "device_id")
    private Integer deviceId;

    private String description;

    @Column(name = "type_action")
    private String typeAction;

    private LocalDateTime timestamp;
}
