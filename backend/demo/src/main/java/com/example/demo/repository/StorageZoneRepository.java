package com.example.demo.repository;

import com.example.demo.entity.StorageZone;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StorageZoneRepository extends JpaRepository<StorageZone, Integer> {
}
