package com.example.demo.repository;

import com.example.demo.entity.StorageRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StorageRoomRepository extends JpaRepository<StorageRoom, Integer> {

    @Query(value = "SELECT r.* FROM storage_room r WHERE r.area_id = :areaId", nativeQuery = true)
    List<StorageRoom> findByAreaId(@Param("areaId") Integer areaId);
}
