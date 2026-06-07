package com.example.demo.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.demo.entity.Role;
import com.example.demo.entity.RolePermission;

public interface RolePermissionRepository extends JpaRepository<RolePermission, Integer> {
    List<RolePermission> findByRoleOrderByPermissionKey(Role role);
    void deleteByRole(Role role);
}
