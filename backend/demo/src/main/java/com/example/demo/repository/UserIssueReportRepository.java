package com.example.demo.repository;

import com.example.demo.entity.UserIssueReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UserIssueReportRepository extends JpaRepository<UserIssueReport, Integer> {
    List<UserIssueReport> findAllByOrderByCreatedAtDesc();
}
