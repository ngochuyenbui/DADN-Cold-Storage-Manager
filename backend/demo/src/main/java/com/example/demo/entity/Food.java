package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDate;

@Data
@Entity
@Table(name = "food")
public class Food {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "food_id")
    private Integer foodId;

    @Column(nullable = false)
    private String name;

    private String type;

    @Column(name = "expire_date")
    private LocalDate expireDate;

    @Column(name = "imported_date")
    private LocalDate importedDate;

    private String description;

    @Column(name = "min_humid")
    private Double minHumid;

    @Column(name = "max_humid")
    private Double maxHumid;

    @Column(name = "min_temper")
    private Double minTemper;

    @Column(name = "max_temper")
    private Double maxTemper;

    private Double weight;
}
