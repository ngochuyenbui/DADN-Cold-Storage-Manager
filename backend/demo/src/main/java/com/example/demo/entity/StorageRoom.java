package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "storage_room")
public class StorageRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "room_id")
    private Integer roomId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "area_id")
    private Integer areaId;

    @Column(name = "max_volume", nullable = false)
    private Double maxVolume = 0d;

    @Column(name = "current_volume", nullable = false)
    private Double currentVolume = 0d;
}
