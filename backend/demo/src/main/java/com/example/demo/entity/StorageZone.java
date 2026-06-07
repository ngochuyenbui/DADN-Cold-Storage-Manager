package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "storage_zone")
public class StorageZone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "area_id")
    private Integer areaId;

    @Column(name = "area_name", nullable = false)
    private String areaName;

    private String location;
}
