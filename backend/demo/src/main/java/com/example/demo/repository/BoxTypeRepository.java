package com.example.demo.repository;

import com.example.demo.entity.BoxType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BoxTypeRepository extends JpaRepository<BoxType, Integer> {
    Optional<BoxType> findByNameIgnoreCase(String name);
}
