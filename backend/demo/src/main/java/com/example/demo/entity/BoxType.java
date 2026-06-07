package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "box_type")
public class BoxType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "box_type_id")
    private Integer boxTypeId;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(name = "length_m", nullable = false)
    private BigDecimal lengthM;

    @Column(name = "width_m", nullable = false)
    private BigDecimal widthM;

    @Column(name = "height_m", nullable = false)
    private BigDecimal heightM;

    @Column(name = "volume_m3", nullable = false)
    private BigDecimal volumeM3;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
