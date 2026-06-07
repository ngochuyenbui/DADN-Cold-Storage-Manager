package com.example.demo.repository;

import com.example.demo.entity.InventoryTransactionItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InventoryTransactionItemRepository extends JpaRepository<InventoryTransactionItem, Integer> {
}
