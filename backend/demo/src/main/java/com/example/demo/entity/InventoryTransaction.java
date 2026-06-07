package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "inventory_transaction")
public class InventoryTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "transaction_id")
    private Integer transactionId;

    @Column(name = "transaction_type", nullable = false)
    private String transactionType;

    @Column(name = "area_id", nullable = false)
    private Integer areaId;

    @Column(name = "room_id", nullable = false)
    private Integer roomId;

    @Column(name = "note")
    private String note;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
