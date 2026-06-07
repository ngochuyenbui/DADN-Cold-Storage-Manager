package com.example.demo.repository;

import com.example.demo.entity.StorageSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StorageScheduleRepository extends JpaRepository<StorageSchedule, Integer> {
}
