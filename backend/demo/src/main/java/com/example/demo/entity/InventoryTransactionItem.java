package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Entity
@Table(name = "inventory_transaction_item")
public class InventoryTransactionItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "item_id")
    private Integer itemId;

    @Column(name = "transaction_id", nullable = false)
    private Integer transactionId;

    @Column(name = "food_name", nullable = false)
    private String foodName;

    @Column(name = "food_type")
    private String foodType;

    @Column(name = "box_type_id")
    private Integer boxTypeId;

    @Column(name = "box_count", nullable = false)
    private Integer boxCount;

    @Column(name = "unit_volume", nullable = false)
    private BigDecimal unitVolume;

    @Column(name = "total_volume", nullable = false)
    private BigDecimal totalVolume;
}
